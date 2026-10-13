# App Development Plan

Date: 2026-10-08  
Project: Gnouht Together  
Status: Proposed implementation plan

> **Current scope note, 2026-10-11:** this document records the broader 2026-10-08 proposal. Its navigation directory and Today shortcut recommendations are superseded by [`product-refresh-plan.md`](product-refresh-plan.md): keep Notes in the organizer directory and remove Tasks, Habits, Today, Meetups, Expenses, and Statistics from navigation entry points. The current server and browser performance plan is in [`performance-plan.md`](performance-plan.md).

The app already has calendar, chat, activity modes, location sharing, profiles, and a Web Push foundation. This plan extends these modules, improves everyday interactions, and verifies that the deployed backend supports them.

This document is a development plan only. Saving it does not implement features, change account permissions, or deploy changes.

## 1. Fix navigation and make features easier to discover

The current mobile navigation has six main tabs, additional horizontal tabs, and an account menu. This makes some features difficult to find.

### Proposed changes

- Use five primary destinations: **Mode, Calendar, Chat, Map, Menu**.
- Make Menu a complete directory of all features the current user can access: Today, Friends, Groups, Meetups, Tasks, Habits, Notes, Statistics, Profile, Privacy, and Settings.
- Add customizable shortcuts on Today so frequently used features are also accessible from the main interface.
- Keep notifications and the account menu accessible from every screen.
- Use the same feature registry for desktop navigation, mobile navigation, search, and shortcuts to prevent inconsistencies.
- Show Expenses only when the backend confirms that the account has permission.

### Acceptance criteria

- Every authorized feature is reachable within two taps.
- Navigation works at 320px width.
- No feature is available only through a hidden or undocumented route.

## 2. Add online presence with explicit sharing controls

Keep these concepts separate:

| Information | Meaning |
|---|---|
| Activity mode | What someone chooses to say they are doing |
| Online presence | Whether the app has recently observed an active session |
| Location freshness | When their location was last updated |

A web app cannot reliably determine whether someone's phone is powered on or whether they are using another app. Page visibility can report that the app became hidden, but this can mean switching tabs, minimizing the window, or turning off the screen. Background timers can also be throttled. The interface should therefore say **Active in app** or **Last active…** rather than **Phone is on**. See the [MDN Page Visibility API documentation](https://developer.mozilla.org/en-US/docs/Web/API/Page_Visibility_API).

### Implementation

- Add opt-in presence sharing with audience controls: nobody, accepted friends, or selected friends.
- Add a separate option for showing the last-active timestamp.
- Send a lightweight heartbeat approximately every 30 seconds while the app is visible.
- Treat sessions without a fresh heartbeat after approximately 90 seconds as inactive.
- Aggregate multiple devices so closing one tab does not make an active user appear offline.
- Show **Active**, **Recently active**, or **Status unavailable**.
- Revoke visibility immediately when someone disables sharing, blocks a person, or removes a friendship.
- Store only the current session state and permitted last-active timestamp, without an activity-history feed.

### Acceptance criteria

Test foreground use, backgrounding, screen lock, lost connectivity, multiple tabs, sign-out, and permission revocation using two real accounts.

## 3. Complete device push notifications

The repository already contains push subscriptions, notification preferences, a service-worker handler, and a delivery worker. First verify their deployment and configuration; repository documentation contains different historical deployment states.

### Notification coverage

| Trigger | Recipient and action |
|---|---|
| Friend changes mode | Eligible friends who enabled mode alerts; open that friend's mode |
| New message or existing social notification | Relevant recipient; open the conversation or request |
| Appointment invitation, change, or cancellation | Invited participants; open the appointment |
| Upcoming appointment | Confirmed participants; open appointment details |
| Event shared, updated, or approaching | Authorized viewers or participants; open the event |
| Schedule-sharing request | Schedule owner; open an accept/decline screen |
| Schedule request accepted or declined | Requester; show the result |

### Delivery requirements

- Save the in-app notification before attempting push.
- Add deduplication, bounded retries, expired-subscription cleanup, and delivery diagnostics.
- Support per-category preferences, quiet hours, timezone, and device-specific subscription management.
- Add **Send test notification** and clear permission/setup status.
- Coalesce rapid mode changes to avoid repeated alerts.
- Cancel or reschedule reminders when an event changes.
- Recheck access before delivery so revoked sharing does not leak event details.
- Offer private lock-screen previews and translate notification text into the recipient's language.
- Validate notification links before opening them.

For iPhone and iPad, include installation guidance: supported Home Screen web apps can request push permission following a user interaction. Push remains subject to browser, device, and network behavior. See [Apple's Web Push documentation](https://developer.apple.com/documentation/usernotifications/sending-web-push-notifications-in-web-apps-and-browsers).

### Acceptance criteria

Verify actual device delivery on Android, an installed iPhone PWA, and desktop, including closed-app delivery, denied permission, quiet hours, and duplicate prevention.

## 4. Build a complete expense-management module exclusively for tk1ll3r

This is a private ledger that **tk1ll3r manages**, recording expenses for the account owner and their partner. The partner can be selected as the payer without receiving access to the module.

### Entry flow

**Enter amount → choose Me or Partner → Save**

Default the date to today and make category, note, outing, and split details optional.

### Initial features

- Record, edit, and delete expenses.
- Choose the person who paid.
- Track an outing such as dinner, a trip, or a date.
- Default to VND.
- Support equal splits, custom splits, and expenses assigned entirely to one person.
- Record repayments separately from expenses.
- Show total spending, spending by payer, category breakdowns, monthly trends, and outstanding balance.
- Filter by date, category, payer, or outing.
- Export CSV and retain an edit history.

### Proposed data model

| Entity | Important fields |
|---|---|
| `feature_grants` | User ID, feature key, grant/revocation timestamps |
| `expense_books` | Owner ID, name, currency, default split |
| `expense_participants` | Book ID, display name, optional linked account ID |
| `expense_categories` | Book ID, name, icon, order |
| `expense_outings` | Book ID, title, date, optional event/meetup reference |
| `expenses` | Book ID, amount, payer, category, outing, date, note, version |
| `expense_splits` | Expense ID, participant ID, allocated amount |
| `expense_settlements` | Book ID, paying participant, receiving participant, amount, date |
| `expense_audit_log` | Actor, operation, affected record, timestamp, change details |

Money should use integer minor units, with VND stored as whole đồng. Validate that allocations equal the expense amount and all referenced participants belong to the same book.

### Calculation example

- The owner pays 600,000₫ for dinner.
- The partner pays 200,000₫ for transport.
- With equal splits, each person's share is 400,000₫.
- The app shows that the partner owes the owner 200,000₫.
- A repayment clears the balance without increasing spending.

### Permission implementation

- Resolve and verify the existing `tk1ll3r` account's immutable authentication user ID.
- Grant that ID the `couple_expenses` capability through a privileged migration or administration operation.
- Never authorize access by comparing an editable username in frontend code.
- Enforce both the feature grant and book ownership through database row-level security and server functions.
- Prevent ordinary clients from granting themselves access.
- Apply the same restrictions to statistics, exports, search, and realtime subscriptions.
- Keep partner records separate from access grants.

### Acceptance criteria

- tk1ll3r can manage the ledger.
- Another authenticated account cannot read, write, export, subscribe to, or discover its data through direct API calls.
- Expense edits, custom splits, and repayments produce correct totals and balances.

## 5. Make event and schedule creation fast

Replace the initial long form with a compact creation sheet:

- Title.
- Date/time presets: Now, Tonight, Tomorrow, This weekend.
- Duration presets: 30 minutes, 1 hour, 2 hours.
- Optional friend selection.
- One clear Save button.

Move recurrence, custom end time, detailed audience settings, and other advanced fields into expandable options. Keep the selected audience visible before saving.

### Shortcuts

- Tap an empty calendar slot to create a prefilled event.
- Duplicate an existing event.
- Reuse templates such as Coffee, Dinner, Study, or Date.
- Turn a free-time result into a meetup.
- Turn a mode or activity into a scheduled plan.
- Remember recent people and places without automatically broadening privacy.
- Preserve unfinished input after validation or network errors.

Use the existing calendar and meetup models. Confirmed meetups should appear once in the calendar rather than creating duplicate independent events.

### Schedule-sharing requests

- Add pending, accepted, declined, cancelled, and expired states.
- Let the owner choose **busy/free only** or **event details**, with a date range and expiration.
- Default to busy/free access.
- Create the access grant only after acceptance.
- Allow immediate revocation and prevent repeated request spam.

### Acceptance criteria

- A simple event can be created in under 15 seconds during usability testing.
- Schedule details remain inaccessible until the owner explicitly grants access.

## 6. Add temporary conversations to events, activities, and modes

Extend the existing chat module with contextual rooms.

### User flow

**Open an event/activity/mode → Enable discussion → Add an opening message → Eligible people join and chat**

### Implementation

- Add a contextual conversation type linked to an event, meetup, or specific mode session.
- Reuse existing message rendering, unread counts, pagination, and notification handling.
- Show the source title, participants, and room expiration.
- Restrict joining and reading to the source's authorized audience.
- Remove access when invitations or sharing rights are revoked.
- Support mute, leave, remove participant, and close-room actions.
- Enforce expiry on the server, including message sending and realtime access.
- Give recurring-event occurrences separate discussions where appropriate.

### Proposed lifecycle

- Event or meetup room: closes 24 hours after the activity ends.
- Mode room: closes when that mode session expires.
- Closed rooms become read-only for a disclosed retention period, proposed as seven days, then messages are deleted by a scheduled job.
- Owners can close a room early.

### Acceptance criteria

- An eligible participant can join from the source card.
- An unauthorized user cannot access the room.
- Closed rooms reject new messages even through direct API calls.

## 7. Improve map clarity, responsiveness, and self-location

The current map recreates all markers whenever its points change. The page also refreshes labels and location data regularly. This is a plausible source of unnecessary work; profile it on a real phone before attributing all lag to it.

### UI changes

- Give the map most of the screen, with a collapsible friend list on mobile.
- Add **My location**, **Show everyone**, and friend search.
- Show the user's position as a distinct marker with an accuracy circle.
- Show distance, last update, and sharing status beside each friend.
- Clearly distinguish current, approximate, and stale locations.
- Keep sharing controls easy to reach.

### Self-location behavior

- Request location permission when the user selects **My location**.
- Allow local self-location without enabling sharing.
- Keep that position on the device unless the user explicitly starts a sharing session.
- Calculate straight-line distance to friends locally.
- Label approximate or stale distances accordingly; do not present them as travel distance or arrival time.

### Performance work

- Update existing markers by ID instead of rebuilding every marker.
- Separate timestamp-label updates from map rendering.
- Preserve the user's camera position during updates.
- Batch coordinate updates and limit unnecessary animations.
- Introduce clustering or map layers if profiling shows marker count warrants it.
- Reduce redundant polling while preserving active sharing behavior.
- Keep the friend list usable when map resources fail.

### Acceptance criteria

- On an agreed midrange phone, target at least 45 FPS during typical panning with 50 simulated friends.
- Test camera stability, denied GPS permission, stale positions, and zero location uploads in local-only mode.

## 8. Complete profile management and other lightweight screens

### Profile improvements

- Avatar upload, crop, replacement, and removal.
- Clear profile preview.
- Username availability feedback.
- Better biography editing.
- Audience controls for newly shareable fields; birthday remains private by default.
- Presence and schedule-sharing controls accessible from the profile.
- Clear saved, unsaved, loading, and error states.

### Shared interaction standards

Audit Friends, Groups, Today, Tasks, Notes, and Settings for:

- One obvious primary action.
- Useful empty states.
- Search and filtering where lists grow.
- Quick actions on list items.
- Recoverable form errors that preserve input.
- Accessible touch targets, keyboard navigation, and both languages.
- Undo for reversible actions where practical.

## 9. Delivery sequence

Estimates assume one full-time developer familiar with the codebase, with device testing included.

| Phase | Scope | Estimated effort |
|---|---|---|
| 0 | Verify deployed migrations, push configuration, current permissions, and performance baseline | 2–3 days |
| 1 | Navigation, shortcuts, quick event creation, profile improvements | 6–8 days |
| 2 | Presence, schedule requests, and complete push delivery | 7–10 days |
| 3 | Private expense module and tk1ll3r permission grant | 6–8 days |
| 4 | Temporary contextual conversations | 4–6 days |
| 5 | Map improvements, self-location, and distances | 4–6 days |
| 6 | Cross-device testing, integration fixes, and staged release | 3–4 days |

**Total planning estimate: 32–45 working days, approximately 7–9 weeks.** Reassess after Phase 0, especially if production configuration differs from the repository.

## 10. Validation and release gates

Each phase should pass relevant unit tests, database permission tests, browser tests, and production-build checks.

The release gate must also include:

- Real-device push delivery.
- GPS and presence behavior on real devices.
- Expense calculation checks.
- Unauthorized API access attempts.
- Verification that revoking access removes data from active clients.
- Verification of required migrations, worker configuration, scheduled jobs, and deployed application compatibility.

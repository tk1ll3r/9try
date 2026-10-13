# Feature plan 2: landing page, chat, photo frame on Mode, map look, .ics import, shared expense books

Date: 2026-10-09. Project: Gnouht Together, branch `refactor/foundation`.

Status: approved by the owner on 2026-10-09 and built the same day, Phases 1 to 7. What was built, what differs from this plan, and what is checked and what is not, is the entry of 2026-10-09, 22:30 in `docs/implementation-progress.md`. The owner put it on the cloud in the night of 2026-10-10: the database is at 0044 and the site is the new build, as the entry of 2026-10-10, 02:45 records.

> **Scope update, 2026-10-11:** the owner changed the photo-retention, camera, and navigation requirements. Stories remain visible for 24 hours while photos are saved immediately in a separate archive; posting is unlimited. In-app camera access is enabled for the app's own origin, with device-picker fallback. Tasks, Habits, Today, Meetups, Expenses, and Statistics are removed from navigation entry points while their routes and data remain. The current product scope and release sequence are in [`product-refresh-plan.md`](product-refresh-plan.md); capacity targets are in [`performance-plan.md`](performance-plan.md). The earlier 24-hour deletion and 20-photo cap below are historical decisions superseded by migration 0046.

## Context

The owner asked for six things and for a detailed plan in English:

1. A page for visitors who are not signed in, with diagrams and drawings that say what the app is and what it does, so that people start using it.
2. More chat features, with Messenger and open-source chat apps as references.
3. A frame on the Mode screen that shows friends' photos over time, as Locket does, with improvements.
4. A softer map in the app's own colors, with open-source map projects as references.
5. The .ics calendar import, which did not work for the owner.
6. Expenses shared between the owner and their partner, possibly with a group, with a permission model.

Four answers from the owner on 2026-10-09 settle the open points:

| Question | Answer |
|---|---|
| What a "fund" is | A split ledger only: who paid, and who owes whom. No pooled fund |
| Who may create a book | Only an account that holds the capability, which today is the owner. For a group, the owner has to be in it and creates the book. Invited people use a book by their role |
| What went wrong with .ics | Events were missing after an import, and an error appeared when a file was chosen. The message was not written down |
| How long photos on Mode live | 24 hours, then they are deleted |

## Where the code stands

| Area | Today | What is missing |
|---|---|---|
| Signed-out visitor | `src/app/AuthenticatedApp.tsx` shows `AuthPage` at every path. A desktop gets a dark panel with one sentence; a phone gets only the sign-in form | Nothing says what the app is |
| Chat | Text only. `messages` holds id, sender, body and time. `chat/presentation/Thread.tsx` (97 lines) draws one bubble per message | Reply, reaction, edit, unsend, seen, typing, photos, search, and mute outside rooms |
| Mode | The user's own mode, a strip of active friends, ranked friend cards | Photos. The app uses no file storage: a profile picture is a data URL of at most 60,000 characters in `profiles.avatar_url` |
| Map | MapLibre with OpenFreeMap's `liberty` style in both looks. Markers are an initial in a dark circle, the viewer is a `#2563eb` dot, controls and popups are MapLibre's defaults | Colors and shapes that come from the app's own tokens |
| .ics import | `calendar/domain/ics.ts` skips every repeating event, refuses more than 100 events or 2 MB, drops an event without a title or without a length, and shows the parser's English error as it is. `IcsImportCard.tsx` saves each event with two requests | A class timetable or a Google export loses most of its events or is refused |
| Expenses | Migration 0036: one private book per owner, for accounts with the `couple_expenses` capability. The partner is a name without access | A second account that sees and adds entries; a book for a group |

The tree has 159 uncommitted paths on top of `ac6a859`. The cloud database is at migration 0037, migration 0038 is local only, the live site is still the build of 2026-10-08, and push has no keys.

## Phase 0. Put what is built on the cloud

The owner still looks at the build of 2026-10-08, which has no expense ledger, no rooms and no push settings. Two commands are owed, as `docs/deployment.md` describes:

```
PATH="$HOME/.local/share/pi-node/node-v22.23.3-linux-x64/bin:$PATH" npx supabase@2.119.0 db push --linked
PATH="$HOME/.local/share/pi-node/node-v22.23.3-linux-x64/bin:$PATH" npm run push:setup
```

After them the Menu shows "Chi tiêu" for the owner's account. If it does not, migration 0036 found no account named `tk1ll3r` when it ran, and the grant is one line in the SQL editor: `select private.grant_feature('<user id>', 'couple_expenses');`.

Recommended before new work, on the owner's word only: commit the 159 paths. Six features on top of an uncommitted tree leave no point to go back to.

Phase 3 depends on this phase: its file cleanup runs in the push worker, which the database can call only after `push:setup` has stored the worker's address.

## Phase 1. The .ics import

### What the owner most likely met

| What the code does | What a person sees |
|---|---|
| Skips every event with a repeat rule, and every changed date of one | A timetable or a list of birthdays does not arrive |
| Throws at more than 100 events | "Chỉ hỗ trợ tối đa 100 sự kiện mỗi file" for the export of any calendar in real use |
| Throws at more than 2 MB, or when the text has no `BEGIN:VCALENDAR` | The second also happens for the .zip that Google's export produces and for a UTF-16 file |
| Passes the parser's own error on | An English sentence about an invalid line |
| Drops an event without a title, and one whose end is not after its start | Deadlines and untitled entries vanish, and the preview only counts them |

The first step is to run the current parser on the file that failed, on this machine, and record which rows it hits. The file stays out of the repository; the test fixtures are written by hand in the same shapes. Without the file the phase goes ahead on the fixtures.

### Reading the file (`src/modules/calendar/domain/ics.ts`)

The calendar's frame with its time zones is parsed once, then each event by itself, so one unreadable event is skipped with its line number and the rest are imported. Events are grouped by UID to join a series with its changed dates.

| The file says | Stored as |
|---|---|
| Daily, weekly or monthly without an interval, on the weekday or the day of its first date, with an end date, a count or no end | One repeating event of the kind the app already has. A count becomes an end date. `EXDATE` and cancelled dates become skipped dates, a changed date (`RECURRENCE-ID`) becomes a changed date in `calendar_event_exceptions` |
| Weekly on several weekdays (`BYDAY=MO,WE`) | One weekly event per weekday |
| Any other rule: every 2 weeks, yearly, "second Tuesday" | A single event for each occurrence from one month back to twelve months ahead, at most 200 per series, computed by ical.js's own iterator. The preview says so |

The app's repeat model (daily, weekly, monthly) is not widened. SQL functions in migrations 0010, 0022 and 0034 read it for shared calendars and busy times, and a wider model would touch all of them.

Other rules: a timed event without an end gets 30 minutes; an event without a title is named "(Không có tên)"; the file is read as bytes, and a UTF-16 mark is honored; a .zip is answered with "Đây là file .zip. Hãy giải nén rồi chọn file .ics bên trong."; every other failure is a Vietnamese sentence with the line number. Limits: 5 MB, 5,000 events read, 1,000 rows stored in one import. A switch "Bỏ sự kiện đã kết thúc" is on by default. If more than 1,000 remain, the nearest 1,000 by start date are taken and the message says how many were left.

### Saving (`0039_calendar_import.sql`)

`import_calendar_events(p_events jsonb) returns jsonb` stores the batch for the caller in one transaction and answers `{added, already_there}`. It exists because the unique index on `(owner_id, external_uid)` is partial, which PostgREST's upsert cannot name, and because one call replaces up to 2,000 requests. Every imported event is private; the function takes no visibility. It refuses more than 1,000 entries and names the first entry that fails a check. The direct insert that an older build uses keeps working.

A second import of the same file adds nothing and changes nothing. An event edited in the app is therefore never overwritten by its source.

### Screen (`calendar/presentation/IcsImportCard.tsx`)

The preview has three groups: single events, repeating events with their rule in words, and what was left out with the reason for each kind. A switch "Lịch lặp hằng tuần là lớp học" stores weekly series as classes, so they appear on the timetable. The card is also offered on `/timetable`, where a student looks for it.

### Tests and when it is done

- `calendar/domain/ics.test.ts`: a Google export shape (time zone block, repeat rule, `EXDATE`, a changed date), an Outlook shape with Windows zone names, a timetable with `BYDAY=MO,WE;UNTIL`, a count, every 2 weeks, a yearly birthday, no end, no title, UTF-16, a .zip, 1,500 events, one broken event among good ones.
- `supabase/tests/database/calendar_import.test.sql`: own rows only, a second import adds nothing, 1,001 entries refused, an anonymous caller refused, exceptions stored, a friend with a schedule grant sees the imported repeats as busy.
- `e2e/calendar.spec.ts`: choose a file, read the preview, import, see the events on the board at phone width.

Done when the owner's own file imports and every event in it is either on the calendar or listed in the preview with its reason.

Left out: subscribing to a calendar address that keeps itself up to date, which the owner did not choose.

## Phase 2. Landing page

### Who sees it

| Signed out, at | Shows |
|---|---|
| `/` in a browser | The landing page |
| `/` in the installed app (`display-mode: standalone`) | Sign-in, as today |
| `/login` | Sign-in, then the home screen |
| Any other path, such as an invite link or a notification link | Sign-in with that path to return to, as today |

### What is on it

| Section | Text | Drawing |
|---|---|---|
| Top | The name, one sentence on what the app is, "Bắt đầu" and "Xem ứng dụng làm gì" | A phone drawn in markup with the Mode screen: friends with turning rings, a photo frame, a mode being turned on |
| How a day goes | Three steps | Diagram 1: someone turns a mode on or posts a photo; friends see it and write or propose a time; the plan is on both calendars and on the map. The arrows draw themselves when the section scrolls in |
| What is in the app | The five screens of the bottom bar, then the rest of the Menu, one line each | Diagram 2: the phone again with a callout to each tab, each with a small drawing (a week strip, bubbles, a map with faces, a ring) |
| Who sees what | Private unless the person shares | Diagram 3: three rings. Only you: tasks, notes, private events. Friends you choose: mode, photos for 24 hours, location for a set time, busy times on request. Everyone else: nothing |
| Install it | Steps for Android and for iPhone | Diagram 4: Share, then "Add to Home Screen"; and the browser's own install button where `kernel/install.ts` has an offer |
| Questions | What it costs, who can join, how to delete the account and its data | None |
| Foot | Language, look, sign-in | None |

### How it is built

The drawings are inline SVG and markup that use the CSS variables of `src/styles.css`, so they follow the light and the dark look and weigh little. Text goes through `t()`. Motion uses the keyframes the app has (`rise`, `pop`, `drift`, the `mode-ring` spin) and two new ones, a line that draws itself and a slow float; the rule that stops motion under `prefers-reduced-motion` covers them. No image file is added except the share picture, and no dependency.

The page is its own lazily loaded chunk with a budget of 25 kB gzip for script and style together, read from the build's output. `index.html` gets a description, Open Graph and Twitter tags, and `public/og.png` (1200×630): Messenger and Zalo read these from the static page when someone shares the link.

The page describes what exists on the day it ships. The expense ledger is by invitation and is not advertised.

### Files, reuse, tests

- New: `src/app/landing/LandingPage.tsx`, `src/app/landing/drawings.tsx`, `public/og.png`, `e2e/landing.spec.ts`.
- Changed: `src/app/AuthenticatedApp.tsx` (the table above), `index.html`, `src/styles.css`, `src/kernel/locales/en.ts`, and `e2e/english.spec.ts`, whose first test opens `/` and expects the sign-in heading.
- Reused as they are: `AuthPage`, `LanguageSwitch`, `ThemeSwitch`, `Button`, the classes `aurora`, `glass`, `mode-ring`, `animate-rise`, `animate-pop`.
- Browser tests: the landing in both languages with no Vietnamese left in English; 320 px and 390 px without sideways scroll; "Bắt đầu" leads to sign-in; an invite path still shows sign-in and keeps the path; the installed app shows sign-in; reduced motion shows each drawing in its final state; the dark look.

Done when a first-time visitor on a phone reads on the first screen what the app is and how to start, and the chunk is inside its budget. The share card is checked by the owner after the deploy.

## Phase 3. Photo frame on Mode ("Khoảnh khắc")

### Against Locket

| Locket | Here |
|---|---|
| A photo appears in a widget on the friend's home screen | A web app cannot have a widget. The frame is at the top of Mode, the screen the installed app opens on, and a push says that a photo is there. The picture inside the push is left out: web.dev lists it for Chrome on Android, and the vendor notes found say Safari ignores it |
| Every photo is kept as history | The last 24 hours, by the owner's choice |
| A photo goes to friends chosen for it | The same: all friends or chosen ones, remembered on the device |
| A reaction tells the sender it was seen | One tap from six reactions. The sender sees who looked and who reacted |
| A reply is a message | A reply opens the direct chat with a first line that names the photo's time. Once Phase 4's cards exist, the reply carries the photo as a card |
| A photo is only a photo | A photo carries its owner's mode ("Cà phê"), and posting can turn that mode on in the same step. A fresh photo moves the friend up on Mode with the reason "Vừa đăng ảnh" |

### The frame

A large rounded card (4:5) under `MyModeHero`: the newest unseen photo with the name, the time, a chip in the mode's color and the caption. Ticks along the top stand for the photos of the last 24 hours; a tap on either side or a swipe moves between them. The first tile is "+". A tap on the photo opens it full screen, where holding pauses and the arrow keys and Escape work. A face in "Đang hoạt động" gets a small camera mark while that friend has a photo, and a tap on it opens that friend's photos.

### Posting

`<input type="file" accept="image/*" capture="environment">` opens the phone's own camera; a desktop picks a file. The photo is redrawn on a canvas at 1,080 px on its long side as a JPEG of at most 300 kB, the way `AvatarEditor.tsx` already decodes and draws a picture. The redraw also drops the place and the device that a phone writes into a photo. Then a caption of up to 80 characters, the mode chip, who sees it, and "Đăng". `Permissions-Policy: camera=()` in `public/_headers` stays, because the page never opens the camera itself.

### Storage and data (`0040_moments.sql`)

This is the app's first use of Supabase Storage. The free plan holds 1 GB.

- A private bucket `moments`: JPEG only, 512 kB a file, path `<user id>/<moment id>.jpg`.
- Policies on `storage.objects`: a person writes and deletes only under their own id, and reads a file only if `private.can_see_moment` allows the row that names it.
- The app reads the photos through signed addresses that last an hour, one `createSignedUrls` call for the whole frame.

| Table | Holds |
|---|---|
| `moments` | id, owner, path, mode key, caption, size, created, `expires_at` (created + 24 h), audience `friends` or `selected` |
| `moment_viewers` | The chosen friends of a `selected` photo |
| `moment_views` | Who looked, and when |
| `moment_reactions` | One reaction per person per photo |

Functions, all `security definer` with an empty search path and for signed-in callers only: `post_moment` (checks that the file exists under the caller's id, that every chosen viewer is an accepted friend, and at most 20 photos in 24 hours), `list_moments`, `see_moment`, `react_to_moment`, `delete_moment`, `list_moment_views` for the owner. `private.can_see_moment(moment, user)` is true for the owner, and for an accepted friend who is not blocked and is in the audience, while `expires_at` is ahead. It is asked on every read, so unfriending or blocking ends access at once. Twenty photos of 300 kB are 6 MB a person at most.

### Deleting after 24 hours

1. From the 24th hour `can_see_moment` refuses the row and the file, whether or not anything was cleaned up.
2. A pg_cron job `moments-expire` deletes expired rows every 10 minutes.
3. Files have to be removed through the Storage API: a row deleted from `storage.objects` by SQL leaves the stored file behind. The worker that already runs every minute with the service key (`supabase/functions/process-reminders`) gets a second job in `_shared/`: ask `orphan_moment_files()` for files without a row that are older than an hour, and remove them. The job runs before the worker's check for push keys.

### In the app

- New kernel file `src/kernel/image.ts`: `toJpeg(file, { maxSide, maxBytes })`, used again by chat photos in Phase 4.
- New module `src/modules/moments/`: `domain/Moment.ts` (what is live at a given time, unseen first), `infrastructure/SupabaseMomentRepository.ts`, `presentation/MomentFrame.tsx`, `MomentViewer.tsx`, `MomentComposer.tsx`, `MomentPrivacy.tsx`, `moments.module.ts`, and `index.ts`, which exports the frame and the camera mark. One line in `src/app/modules.ts`.
- `presence/presentation/ModePage.tsx` and `MemberAvatar.tsx` show the frame and the mark, the way `MyModeHero.tsx` already uses `DiscussionButton` from the chat module.
- The module reports a `friendSignals` kind `moment`; `presence/domain/FriendRanking.ts` gives it the weight 45.
- The realtime event is `moments`, the first element of the module's query keys.
- A new photo writes one notification per poster and recipient while it is unseen, in the category `moment`, which gets a line in `notifications/presentation/NotificationSettings.tsx` and its English in `_shared/notificationTexts.ts`. A reaction reaches the owner's inbox without a push.
- Privacy: a section lists the live photos with who sees each and a button "Xóa hết ngay". `export_my_data` gains the rows. `supabase/functions/delete-account` removes the person's files before it deletes the account.

### Tests and when it is done

- `supabase/tests/database/moments.test.sql`: the owner, a friend in the audience, a friend outside a chosen audience, an ex-friend, a blocked person, a stranger, an anonymous visitor; the 24th hour; the limit of 20; the file policies. The embedded Postgres of `npm run test:db` has no Storage, so `scripts/db-smoke.mjs` gets a stand-in for `storage.objects` and `storage.foldername`, as it has for Realtime and pg_cron.
- `e2e/moments.spec.ts`: post from a file, the upload has no EXIF block and is under 300 kB, the photo is in the frame, the viewer moves, a reaction, a delete, phone width, English.
- `scripts/local-two-user-check.mjs` (two accounts on the local stack) gains: An posts, Bình sees it within seconds, and a third account is refused both the row and the file.

Done when that script passes, and an expired photo's file is gone from the local bucket after the worker has run.

Left out: video, a viewfinder inside the page, keeping photos beyond 24 hours, the home-screen widget.

## Phase 4. Chat

### Round A: no files

| Feature | Behavior, after Messenger | Server |
|---|---|---|
| Reply | "Trả lời", or a swipe on a phone. The quoted line sits above the bubble, and a tap goes to the original | `messages.reply_to_id`, within one conversation |
| Reactions | Six: heart, laugh, wow, sad, angry, thumbs-up. One per person per message, and a second tap takes it back. Counts sit under the bubble | `message_reactions` |
| Edit | One's own text, within 15 minutes, marked "đã sửa" | `edit_message` |
| Unsend | One's own message at any time; everyone then reads "Tin nhắn đã thu hồi". A group's owner and admins, and a room's owner, can remove any message there | `delete_message` empties the body and keeps the row |
| Seen | Direct: "Đã xem" under the last message the other person has read. Group: small faces, and a number beyond five | `list_conversation_reads`, from the `conversation_reads` table that exists |
| Typing | "Kha đang nhập…" for five seconds after a key press | A Realtime broadcast on the topic `chat:<conversation id>`, allowed by one policy that asks `private.is_participant`. Nothing is stored |
| Reading comfort | Messages of one person within five minutes form a group; a line for each day; a line "chưa đọc từ đây"; a button to the newest message with a count; addresses become links; an unsent draft is kept per conversation on the device | None |
| Mute | Any conversation, for 1 hour, 8 hours, or until it is turned back on | `conversation_settings.muted_until`, asked before a notification is written |
| Search | Text inside one conversation, newest first; a tap goes to the message | `search_messages` |

### Round B: files and cards

| Feature | Behavior | Server |
|---|---|---|
| Photos | Up to six in a message, shrunk by `kernel/image.ts` to 1,280 px and 250 kB, opened full screen by a tap, kept until the message is unsent. 1 GB holds about 4,000 of them | A private bucket `chat`, path `<conversation id>/<message id>/<n>.jpg`. Reading asks `private.is_participant`. The worker's cleanup of Phase 3 also covers this bucket |
| Cards | "Gửi vào trò chuyện" on an event, a meetup, a live location and a photo on Mode. The message carries a path inside the app and a title, and draws as a card that opens the thing. Whether the reader may open it is decided by that screen, as today | `messages.ref_path`, held to the rule of `isPlainPath`, and `ref_title` |

### Not in this plan

| Feature | Why it waits |
|---|---|
| Voice messages | They need the microphone, which `public/_headers` denies today, and an iPhone and an Android phone record in formats the other may not play |
| Polls in a chat | The app has time polls on meetups. A chat poll is new tables and screens |
| Pinned messages, mentions | Small. They can follow once groups are in daily use |
| Nicknames, conversation colors, a quick emoji | Decoration |
| GIFs and stickers | They need an outside service, which would learn who looks at what |
| Link previews | They need a server that fetches foreign pages |
| End-to-end encryption | A different architecture. Messages stay protected by access rules, as `0020_chat.sql` says |

### Compatibility and code

An installed app can run an older build for days. `send_message(uuid, uuid, text)` therefore stays, and the new arguments go to a new function `post_message`. `list_messages` is dropped and made again with more columns, which an older build ignores, as migration 0037 did with `list_conversations`. An unsent message reaches an older build as the text "Tin nhắn đã thu hồi". The migrations are `0041_chat_replies_reactions_edits.sql` and `0042_chat_photos_and_cards.sql`.

`Thread.tsx` is split into `MessageList.tsx`, `MessageBubble.tsx`, `MessageMenu.tsx`, `Composer.tsx` and `ConversationInfo.tsx`. `domain/Chat.ts` gains pure functions, `groupMessages` and `canEdit(message, now)`. Each action is reached by a long press, by hovering, and by a "…" button that a keyboard reaches (`kernel/ui/MoreMenu`). The typing topic is opened by `SupabaseChatRepository` while a thread is on screen; `kernel/realtime.tsx` keeps its one job of reloading queries.

### Tests and when it is done

- `chat.test.sql` gains: a reply only inside its conversation; a reaction only by a participant; the 15 minutes; unsend by the sender, by a group admin, and not by another member; a closed room refuses all of it; `send_message` still works; a muted person gets no notification; the photo bucket's rules.
- `chat/chat.test.ts`: grouping, the day lines, the edit window against a fixed clock.
- `e2e/chat.spec.ts` (new): reply, react, edit, unsend, search and a photo, at phone width and in English.
- `scripts/local-two-user-check.mjs`: typing and "Đã xem" reach the other account.

Done when two accounts on the local stack pass that script and the suites above.

## Phase 5. Shared expense books

### Who may do what

This table goes into `docs/permission-matrix.md`.

| Action | Owner | Editor | Viewer | Invited, not answered | Anyone else |
|---|---|---|---|---|---|
| Create a book | Needs the capability | No | No | No | No |
| See expenses, balances, statistics and history; export CSV | Yes | Yes | Yes | Sees the book's name and who invited them | No |
| Add an expense or a repayment | Yes | Yes | No | No | No |
| Change or delete an entry | Any entry | Their own entries | No | No | No |
| Add categories and outings | Yes | Yes | No | No | No |
| Invite, remove, change roles; rename or delete the book | Yes | No | No | No | No |
| Leave the book | Deletes it instead | Yes | Yes | Declines | Not applicable |

The rules behind it:

- The capability `couple_expenses` keeps its name and now means "may create books". It is given and taken back with `private.grant_feature` and `private.revoke_feature` by whoever runs SQL as the database owner. No client can.
- A member needs no capability. `my_features()` also answers `expenses` for anyone with the capability, a membership or an invitation, and the Menu entry asks for that word. `kernel/features.ts` is not changed.
- A book between friends: the owner invites accepted friends, and each has to accept. Unfriending or blocking the owner ends the membership; the person's name and entries stay in the book.
- A book of a group: created by a capability holder who is in that group, one book per group. Every member of the group is a member of the book, as editor or as viewer by the book's setting. Triggers on `group_memberships` follow people who join or leave.
- A participant is still a name, and a membership is the grant. The owner can attach an invited friend to a name that exists, such as "Người ấy", so that what the name paid before becomes theirs.
- When the owner's capability is taken back, the book is hidden from everyone until it is given again, as 0036 does for the owner today.
- When the owner's account is deleted, the book goes with it. The deletion screen says so and offers the CSV first.

### Data and functions (`0043_shared_expense_books.sql`)

- `expense_books`: the rule of one book per owner is dropped (0036 marks it for that day); `group_id` is added, unique where set.
- `expense_book_members(book_id, user_id, role, status, participant_id, invited_by, created_at)`, filled with an owner row for each book that exists.
- `expenses.created_by` and `expense_settlements.created_by`; empty means the owner, for rows from before.
- `private.book_role(book, user)` is the one place that answers a person's role. `can_use_expense_book` is redefined on it, so the read policies that call it need no rewrite. The policy on `expense_books`, which compares the owner directly, is replaced. The policies of the small lists, which are written directly, check the role.
- New: `create_expense_book`, `list_expense_books`, `invite_to_book`, `answer_book_invite`, `set_book_member`, `remove_book_member`, `leave_expense_book`, `delete_expense_book`, `list_expense_history` with the names of who changed what.
- Changed: `save_expense`, `delete_expense`, `save_settlement` and `delete_settlement` take the book as a last argument that may be absent, so an older build still reaches its own book. They ask for the editor role, and for the creator or the owner on a change. `open_expense_book()` stays.
- Every change sends the `expenses` event to all members; today it goes to the owner alone.
- `private.revoke_relationship_grants` also ends memberships between the two people. `export_my_data` gains the caller's memberships and the entries that name them.

### In the app (`src/modules/expenses/`)

- Routes `expenses` (the list of books and invitations; with one book it opens that book), `expenses/:bookId`, `expenses/:bookId/stats`, `expenses/:bookId/settings`. The two old addresses lead to the first book.
- `domain/Ledger.ts`: roles, `canChange(entry, me, role)`, an even split among chosen people where the payer need not be one of them, and `settleUp(balances)`, which proposes the fewest repayments: the person who owes most pays the person who is owed most until all are even. `debt()` stays for two people.
- `ExpenseForm.tsx`: the payer among all people of the book, and "Chia cho" as chips. `ExpenseStatsPage.tsx`: for each person what they paid, their share and their balance, and the proposed repayments with "Ghi là đã trả". `ExpenseSettingsPage.tsx`: members, roles, invitations, leaving, and the history with names. The header says who is in the book where it now says "chỉ mình bạn xem được".
- `expenses/index.ts` exports a small link that `groups/presentation/GroupPage.tsx` shows when the group has a book.
- Notifications: an invitation, and a repayment that names the reader. A new expense reloads the screens of the others without a notification.

### Tests and when it is done

- New `shared_expense_books.test.sql`: each cell of the table above for the owner, an editor, a viewer, an invited person, an ex-friend, a blocked person, a group member, someone who left the group, a stranger with the capability, a stranger without it and an anonymous visitor; a viewer's direct write to categories is refused; a taken-back capability hides the book from all; three people with an odd amount; two accounts editing one entry meet "expense changed elsewhere".
- `private_expenses.test.sql` (47 assertions) keeps passing; any assertion whose meaning changes is listed in the progress log.
- `expenses.test.ts`: `settleUp` ends at zero in at most n − 1 repayments; splits for 3 and 5 people.
- `e2e/expenses.spec.ts`: an editor adds and the owner sees it, a viewer has no buttons, an invitation is accepted, at phone width and in English.

Done when, on the local stack, the owner invites a second account as editor attached to "Người ấy", both add expenses and read the same balance within seconds, and a third account gets nothing through the API.

Left out: a pooled fund, several currencies in one book, photos of receipts, repeating expenses, handing a book to another owner.

## Phase 6. Map look

### Style

Two style files, `public/map/light.json` and `public/map/dark.json`, are built by a new `scripts/build-map-style.mjs` from OpenFreeMap's Positron style by replacing its colors from one table. The script reads the token values from `src/styles.css`, so the palette has one source. The tiles, fonts and sprites keep coming from OpenFreeMap. The script and its output are both committed.

Positron's code is under the BSD 3-Clause license and its design derives from CARTO's basemaps under CC-BY 3.0. The two files keep that notice in their `metadata`, and `README.md` names it.

| Map part | Light | Dark |
|---|---|---|
| Land | `--paper` | `--paper` of the dark look |
| Built-up areas | `--soft` | `--soft` |
| Roads | `--surface`, edged with `--border` | `--surface`, edged with `--border` |
| Parks and woods | `--lime` mixed 18% into `--paper` | `--lime-strong` mixed 14% into `--paper` |
| Water | One new token `--map-water`, a muted blue-green picked beside the paper color | Its dark value |
| Labels | `--muted`, with a halo in the land color | The same tokens |

`MapCanvas.tsx` picks the file by `data-theme` and swaps it when the look changes. `VITE_MAP_STYLE_URL` still overrides both. The credits line for OpenStreetMap, OpenMapTiles and OpenFreeMap stays visible, as their licenses ask.

### Markers, controls, layout

| Part | Today | Planned |
|---|---|---|
| A friend | An initial in a `#171a12` circle | The profile picture (`kernel/ui/Avatar`) in a soft white rim, with the ring of the friend's mode when one is on, and the name under it from zoom 14. The pulse for a fresh position, grey for an old one and the dashed rim for an approximate one stay |
| The viewer | A `#2563eb` dot | A dot in `--tone-class`, the blue the calendar already uses, with a soft halo |
| Popup | MapLibre's white box | A rounded card on `--surface`: face, name, mode, distance, "Nhắn tin" |
| Zoom buttons and credits | MapLibre's defaults | The same controls restyled in `styles.css` as rounded glass buttons |
| Phone layout | A map card, then cards below it | The map from the header to the bottom bar, and a sheet over it with three heights: a handle with the faces of who is sharing; the list; the list with the sharing form. It is dragged by pointer events, and a button steps through the heights for a keyboard or a screen reader. A desktop keeps its two columns |
| Movement | A marker jumps to its new place | It glides there in 600 ms. Under reduced motion it jumps |

The friend's mode comes through `presence/index.ts`, which gains one exported hook.

### Tests and when it is done

`e2e/map.spec.ts` gains: the style changes with the look; a marker shows a picture and a mode ring; the sheet's three heights at 390 px by button and by drag; nothing wider than the screen at 320 px. `scripts/build-map-style.mjs` fails when a color it should replace is no longer in the source style. Screenshots of both looks at 390 px and 1,280 px, before and after, go to the owner.

Done when every color on the map screen, the style's included, comes from a token in `src/styles.css`.

Left out: hosting the tiles ourselves (Protomaps on Cloudflare R2), unless OpenFreeMap's public server proves unreliable; clustering, until more than about 30 people share at once; routes and travel times.

## Phase 7. Release pass

- Docs: `docs/architecture.md` (17 modules, Storage, the typing topic, the worker's second job), `docs/module-guide.md`, `docs/permission-matrix.md`, `docs/deployment.md` (the buckets, the commands of each phase), `docs/cost-and-limits.md` (1 GB of files, the egress, how to read the use), `docs/implementation-progress.md`, `README.md`.
- The commands for the owner after each phase: `db push`, `functions deploy process-reminders delete-account` where a phase changed them, `npm run deploy`.
- Checks that need real phones, which this machine cannot do: the camera input inside the installed app on an iPhone and on Android, a push for a new photo, dragging the map sheet, the share card of the landing page.

## Order and size

Sizes are working days for one developer who knows the code.

| Phase | Size | Needs |
|---|---|---|
| 0. Cloud catches up | 15 minutes of the owner's time | Nothing |
| 1. .ics import | 2 | The file that failed, if the owner still has it |
| 2. Landing page | 3 to 4 | Nothing |
| 3. Photo frame on Mode | 5 to 7 | Phase 0 |
| 4. Chat, round A then B | 4 to 5, then 3 | Round B needs Phase 3's storage work |
| 5. Shared expense books | 5 to 7 | Nothing |
| 6. Map look | 3 to 4 | Nothing |
| 7. Release pass | 2 | All of the above |

Phases 1, 2, 5 and 6 can be built in any order. Phase 1 is first because it repairs something that is broken today. Each phase ends in a state that can be deployed. The migration numbers in this plan follow the order above and move if the order does.

## Defaults chosen here that the owner may want different

1. The order of the phases.
2. An editor changes only their own entries in a book; the owner changes any.
3. A group's book takes in every member of the group without asking each one.
4. Chat reactions are a fixed set of six.
5. Chat photos stay until the message is unsent. Over time they are what fills the 1 GB; photos on Mode never hold more than 6 MB a person.
6. A second import of the same .ics file never updates an event.
7. The landing page does not mention the expense ledger.

## Verification

After each phase, in this order, with Node 22 on the `PATH` as in Phase 0:

```
npm run typecheck
npm test
npm run test:db
npx supabase@2.119.0 migration up --local && npm run test:db:local
npx playwright test --workers=3
npm run build
```

- `npm run test:db:local` needs the local stack restarted first: its Realtime service is down, and 19 assertions in 8 files fail for that reason alone since 2026-10-09.
- Storage rules are checked on the local stack with the real Storage, and on the embedded Postgres through the stand-in.
- Two real accounts on the local stack: `scripts/local-two-user-check.mjs`, extended in Phases 3, 4 and 5.
- Real pushes for the new categories: `DENO=… npm run test:push:local`.
- Every new or changed screen is opened in a browser at 390 px and 1,280 px in both looks, and the screenshots are read before a phase is reported as done.
- The progress log records what was run, what was not, and why.

## References

What is taken from each. Code under AGPL or GPL is read for behavior only; nothing is copied from it.

| For | Reference | What is taken |
|---|---|---|
| Photo frame | [Locket](https://locket.camera) | The frame as the first thing on screen, a per-photo audience, one-tap reactions, replies as messages |
| Photo frame | [web.dev: displaying a notification](https://web.dev/articles/push-notifications-display-a-notification) | Why a picture inside a push is left out |
| Chat | [Messenger features](https://www.messenger.com/features) | The reaction set, the 15 minutes for an edit, unsend at any time, "Đã xem", the typing dots |
| Chat | [Signal Desktop](https://github.com/signalapp/Signal-Desktop) (AGPL-3.0) | How a quoted reply and a reaction row are laid out |
| Chat | [Element Web](https://github.com/element-hq/element-web) (AGPL-3.0) and the [Matrix specification](https://spec.matrix.org) | How an edit, a removed message and read receipts are shown and stored as relations to a message |
| Chat | [Zulip](https://github.com/zulip/zulip) (Apache-2.0) | The unread line and the jump to the newest message |
| Chat | [chatscope chat-ui-kit-react](https://github.com/chatscope/chat-ui-kit-react) (MIT) | The parts of a thread and their ARIA roles |
| Chat | [Supabase Realtime authorization](https://supabase.com/docs/guides/realtime/authorization) | The policy for the typing topic |
| Map | [OpenFreeMap styles](https://github.com/hyperknot/openfreemap-styles) and its [quick start](https://openfreemap.org/quick_start/) | Positron as the base style. The README says the dark and fiord styles are unmodified and not yet complete, which is why the dark look is built from Positron too |
| Map | [Protomaps basemap flavors](https://docs.protomaps.com/basemaps/themes) | A map theme as one table of named colors |
| Map | [Maputnik](https://github.com/maplibre/maputnik) (MIT) | The editor for tuning the two styles by hand |
| Map | [Organic Maps](https://github.com/organicmaps/organicmaps), [Grid](https://github.com/Rezivure/Grid-Mobile) | A calm map style; faces as pins and a sheet over the map in a location-sharing app |
| Expenses | [Spliit](https://github.com/spliit-app/spliit) (MIT), [SplitPro](https://github.com/oss-apps/split-pro) (MIT), [I hate money](https://github.com/spiral-project/ihatemoney) | Balances per person, the proposed repayments, splits by chosen people and by exact amount |
| .ics | [RFC 5545](https://datatracker.ietf.org/doc/html/rfc5545), [ical.js](https://github.com/kewisch/ical.js), which the app already uses | The repeat rules and the library's own expansion of them |
| Storage | [Supabase Storage file limits](https://supabase.com/docs/guides/storage/uploads/file-limits) | 50 MB a file at most on the free plan; the buckets here set far less |

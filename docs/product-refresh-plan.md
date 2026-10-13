# Product refresh: Mode, photos, notes, map, and chat

Date: 2026-10-11  
Status: Deployed on 2026-10-12. Migrations 0001–0050 are applied; the current frontend includes the Menu, discussion, and public-metrics updates. See [`deployment.md`](deployment.md) for the release record.

## Product outcome

Make Mode and photos the visual center of the app, use a youthful pink gradient identity, keep the story feed focused on the last 24 hours, and retain photos in a separate private archive. Simplify the organizer navigation around Notes, make map actions immediate, and make everyday chat feel familiar to Messenger users.

## Navigation and visual system

- Use five primary destinations: **Mode, Calendar, Chat, Map, Menu**.
- List every screen available to the signed-in account in the Menu, including child tabs, so secondary features are directly reachable on a phone. Keep child tabs on their parent screen too; keep notifications and account screens in their fixed top-bar controls. Server-granted capabilities continue to control gated screens such as Expenses.
- Keep Notes in the organizer group. Support multiple private notes and sharing with selected accepted friends or groups.
- Use pink and rose for primary accents, soft pink surfaces, plum ink, and a coordinated dark theme. Use the same tokens for the map styles, app icon, browser theme color, and installable app shortcut.
- Keep calendar categories and activity modes distinguishable; the brand palette should not erase their meaning.

## Mode and photo experience

- Make the Mode screen's own activity and photo frame larger. The frame is the primary visual element and offers one-tap capture, browsing, and entry to the archive.
- Keep each photo in the story feed for 24 hours. Remove the posting-count limit; do not load archive records into the live story query.
- Keep the original audience (`all current friends` or `selected friends`) on the photo row. Archive reads and signed photo URLs use the same audience, friendship, and block checks. The owner can delete a photo from both story and archive. Account deletion removes the owner's photo data.
- Save each photo to the cursor-paged archive immediately, while it may still appear in the story feed. Show the photographer's current name and avatar, caption, timestamp, and original audience. Story visibility ends after 24 hours; archive retention continues until the owner deletes the photo or deletes the account.
- Compress images on-device to at most 1,080 px and 300 kB. Use a worker with `OffscreenCanvas` when supported and a canvas fallback for older browsers.
- Mirror the live front-camera preview for a natural view; encode the untransformed camera frame so the saved photo is not mirrored. Use the device camera picker when direct camera access is unavailable.

## Notes and sharing

- Keep an unlimited number of notes, each private by default.
- Let the owner share a note with selected accepted friends or groups, with view or edit permission.
- Revoke direct sharing when the friendship ends. Group access follows current group membership; archiving a group removes that access.
- Allow note owners to revoke individual grants and delete notes. Shared editors may update note content but cannot change grants or delete the owner's note.
- Invalidate shared-note views through realtime events when note, friendship, or group membership changes.

## Map and chat

- Keep the map as a full-screen interaction with an adaptive sheet. Friend markers open a concise card with **Chat** and **Suggest a meetup** actions.
- Preserve the map instance while cards and freshness labels update. Use the app's map palette and show location freshness clearly.
- Keep direct and group conversations in a familiar list-and-thread layout with names, avatars, unread counts, replies, reactions, edits, unsend, photos, search, mute, typing, and read state supported by the existing chat module.
- Use Realtime as the primary update path. Poll only as recovery when a realtime event is missed.

## Performance and capacity

- Keep Cloudflare responsible for static assets and Supabase for authentication, database, realtime, storage, and edge work. Do not size an application VM that the deployment does not use.
- Avoid full-resolution image work on the main thread when browser worker APIs are available. Continue to display the compressed local preview while an upload is pending.
- Use cursor pagination for archive reads and batch signed URLs for the visible archive page. Sign only the current story photo in the Mode frame.
- Capture seven complete days of current production traffic before choosing a synthetic concurrency target. Measure Cloudflare and Supabase dashboards, then size a staging workload from the observed request mix; increase service capacity only after a measured service bottleneck.
- Baseline collection and staging workload are pending. The measurement protocol is in [`performance-plan.md`](performance-plan.md).

## Implementation and release sequence

1. Apply migration `0046` to staging. It removes the daily post cap, keeps expired moment rows and files, adds archive reads, and adds note-share grants and policies.
2. Deploy the frontend with the new theme, navigation, camera flow, archive, notes sharing, map actions, and chat refinements.
3. Verify with two accepted accounts and one excluded account: story visibility before and after 24 hours, selected audiences, archive attribution, delete behavior, note view/edit/revoke, friendship removal, and group archive.
4. Check front and rear cameras on iOS Safari and Android Chrome, including the native picker fallback and unmirrored saved front-camera output.
5. Collect seven complete days of current production traffic, then run a staging workload based on that measured request mix. Record service limits, p95 latency, Realtime delivery, Storage use, and map frame rate before considering production capacity changes.

## Current implementation boundaries

The 2026-10-12 release includes the Mode discussion controls, all signed-in screens in the Menu, public member/visit metrics, and the Cloudflare request counter. Migrations are applied through 0050. No production capacity change was made. The seven-day Supabase baseline and staging benchmark are still pending.

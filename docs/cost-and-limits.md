# Cost drivers

Watch Supabase database compute/storage, Realtime connections/messages, Storage/egress, Edge Function invocations, scheduled reminder volume, Cloudflare hosting limits, and map-tile usage. Location updates are throttled by the client and expire server-side to reduce traffic and retention.

Record actual production plan quotas in the runbook before launch; service limits change over time.

The public request total runs the Cloudflare Worker before each app-host request and schedules one SQLite Durable Object increment in the background. The recorded app-host baseline averages about 5,500 requests/day since first deploy; this is below Cloudflare's published 100,000/day Free limits for Workers and Durable Objects. Watch these quotas if traffic grows, because worker-first static requests invoke the Worker and can be limited like other Worker requests. See [Workers asset billing](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/) and [Durable Object pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/).

## Stored files

The app keeps files in Supabase Storage. Check the current project's Storage quota and usage in its dashboard; plan limits and prices change. Each device also keeps files it has already opened: the service worker caches Storage responses (`gnouht-photos-v1`, CacheFirst, ignoreSearch) for up to 180 days, and the app keeps the signed address in localStorage until a few minutes before it stops working.

| Bucket | A file is at most | A person holds at most | Deleted |
|---|---|---|---|
| `moments`, the photos of the day and their archive | 300 kB as the app sends it (the bucket refuses more than 512 kB) | No per-person or per-day count limit | Story visibility ends after 24 hours; the photo stays in the archive until its owner deletes it or the account is deleted |
| `chat`, the photos in messages | 250 kB as the app sends it (the bucket refuses more than 410 kB) | No limit; six photos a message | When the message is unsent, or its conversation is deleted |

Both chat photos and archived moments accumulate over time. Track Storage and egress in Supabase. The archive is deliberately durable, so expected growth and retention costs must be reviewed before inviting a much larger audience. There is no automatic archive cleanup rule.

A photo is read through a signed address that works for a week. The first view of a file on a device is egress from Supabase; a later view on that same device is served from the service worker and does not download the file again. The Mode frame signs only the photo currently on screen; the archive signs a visible page in one request.

## Map

The tiles, fonts and sprites come from OpenFreeMap's public server, which asks for no key and gives no guarantee. The two styles are files of the app itself. If the tile server proves unreliable, the tile address in `scripts/map/positron.json` is the one thing to change before `npm run build:map`.


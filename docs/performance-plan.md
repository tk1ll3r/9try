# Performance and capacity plan

Date: 2026-10-12  
Priority: measure current production traffic before choosing a synthetic load target  
Status: the public metrics and request counter were deployed on 2026-10-12. The Cloudflare edge baseline is collected; the Supabase baseline and staging load run are pending. No production capacity was changed.

## Runtime layout

Cloudflare serves the compiled static app. Supabase handles authentication, PostgreSQL, Realtime, Storage, and Edge Functions. There is no application server VM in this repository to resize. Capacity decisions use Cloudflare and Supabase service metrics and the project's actual service limits.

## Current application work

- Keep Supabase Realtime as the primary path for chat, modes, location, moments, friends, groups, and notes. Realtime events invalidate the relevant React Query data immediately.
- Keep time-based reads as recovery when a realtime event is missed: open chat messages refresh every 60 seconds, read marks every 2 minutes, conversation lists every 2 minutes, active shared locations every 30 seconds, and modes every 2 minutes. A screen opened again within a minute shows its last answer and does not ask the database again. Focusing the window does not refetch.
- Compress photo input in a Web Worker with `OffscreenCanvas` where available. Use the existing canvas path on browsers that do not support worker encoding. The live front-camera preview is mirrored on screen; the frame is encoded from the untransformed video stream.
- Keep 24-hour stories separate from the cursor-paged permanent archive. Story reads do not load archived photos.
- Preserve the map instance and its markers across ordinary UI updates. Timestamp labels update independently; map-style colors are generated from the theme tokens.
- The public page reads only aggregate counts. Profile changes maintain the member total with a trigger, landing-page openings increment one atomic counter, and a visible visitor tab refreshes once a minute (then refreshes on return to the tab).
- A Cloudflare Worker and SQLite-backed Durable Object keep a cumulative HTTP request total for `9try.gnouht.space`. The Worker schedules one durable increment after each host request without waiting on it before returning the app response. The displayed total starts at Cloudflare's sampled historical estimate and includes static files and automated traffic.
- The 2026-10-12 production build reports the lazy `MapCanvas` chunk at about 1.05 MB before compression and 285 kB gzip. Measure its download and parse time on the agreed phone before deciding whether to split it further.

## Production baseline first

The seven complete Cloudflare days below have been collected. Capture the remaining path/status breakdown and Supabase service metrics before choosing a concurrency target or changing a service plan. Record the measurement window, deployed asset version, migration version, region, and any dashboard gaps.

Capture the metrics the current plans expose:

- Cloudflare: requests by path and status, cache hit ratio, bandwidth, errors, and Web Analytics page views if enabled.
- Supabase: database CPU and memory, query calls and latency, connection-pool use, Realtime connections and messages, Storage reads/writes and egress, and Edge Function duration and errors.
- App paths: landing-page opens, sign-ins, chat sends, mode changes, location updates, story uploads, and archive reads. The public counter starts from an estimated Cloudflare root-page baseline and then records landing-page openings; it is not a unique-person count.

### Collected Cloudflare baseline

Read-only Cloudflare Analytics snapshot for the seven complete UTC days 2026-10-05 through 2026-10-11, zone `gnouht.space`:

| Metric | Seven-day total |
| --- | ---: |
| Requests | 23,170 |
| Page views | 2,927 |
| Unique visitors | 347 |
| Response bytes | 128,248,443 (128.2 MB) |
| Cached requests | 17,972 (77.6%) |

The 347 unique visitors is the Cloudflare dashboard's deduplicated total across this full window. The daily GraphQL unique counts sum to 401 because a visitor on several days appears in each day's count; do not add them to get a weekly unique total. Cloudflare's HTTP traffic can include crawlers and threats, so this is not a count of authenticated or confirmed people. The zone totals include proxied hostnames under `gnouht.space`; use them as an edge-capacity baseline, not as exact app-only traffic.

For the public visit counter, Cloudflare Web Analytics RUM filtered to the app host and root path (`9try.gnouht.space`, `/`) estimated **286 page openings** from the first deployment at 2026-10-08 02:16:40 UTC through 2026-10-12 04:57:40 UTC. Cloudflare's adaptive sampling returned summed per-day 95% confidence bounds of 253–319. Migration `0050` seeds that estimate; production read-only verification returned 286 at 06:15 UTC, and the app now records each new landing-page opening atomically. Openings between the snapshot and release are not included, so the initial count is a sampled baseline rather than a complete exact count. This is an opening count, not a unique-person count.

For the request counter, Cloudflare's adaptive HTTP analytics for `9try.gnouht.space` estimated **22,521 requests** from the first deployment through 2026-10-12 05:22 UTC (95% confidence interval 22,110–22,931). The Worker seeded its Durable Object with that estimate on first initialization; its endpoint returned **22,560** at 06:22 UTC after adding requests since release. This is an app-host total, not the zone-wide seven-day total of 23,170 shown above; it includes HTML, static assets, API requests, and bots. The historical estimate ends before the Worker was deployed at 06:13 UTC, leaving a small unmeasured interval, and Cloudflare's baseline is sampled. Worker-first routing means each app-host request invokes the Worker and schedules one Durable Object write, but the write runs outside the response path. Cloudflare documents [adaptive sampling](https://developers.cloudflare.com/analytics/graphql-api/sampling/), [Worker asset billing](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/), and [Durable Object limits and pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/).

Cloudflare explains its Web Analytics reporting in the [Web Analytics FAQ](https://developers.cloudflare.com/web-analytics/faq/) and [GraphQL confidence interval docs](https://developers.cloudflare.com/analytics/graphql-api/features/confidence-intervals/).

The Cloudflare portion of the baseline is collected. A valid seven-day Supabase baseline and a staging load run are still pending. The linked Supabase CLI's `inspect db calls` returned cumulative `pg_stat_statements` totals without a reset timestamp or measurement window. `inspect db db-stats` and `traffic-profile` failed direct PostgreSQL password authentication. Do not use those snapshots to make capacity decisions.

## Staging load run after the baseline

Use the measured production peak and request mix to choose staging load levels. Ramp each run gradually, hold long enough to observe steady state, and repeat with a reconnect period after a short network interruption. Record actual session counts, data volume, client mix, region, and deployed migration versions; choose the target from the baseline instead of a preset session count.

Exercise representative paths separately before combining them: chat and Realtime updates, map/location reads, mode changes, photo uploads, and cursor-paged archive browsing. Include at least one run with representative photo sizes and one reconnect run. Use a staging project with non-production accounts and data.

## Capacity and query decisions

Compare p50/p95 latency, failures, throughput, and service usage with the measured baseline and the configured service limits. Increase paid capacity only when a representative workload breaches an agreed guardrail and the service metrics identify that service as the bottleneck.

If database CPU is high, inspect slow SQL, query plans, indexes, and repeated reads before scaling. If Realtime nears its configured limit, reduce unnecessary channels and payloads. If Storage egress dominates, reduce duplicate image loads and keep the archive paged. If Cloudflare serves the static app within its limits, no extra application server is needed.

## Release gate

Save the seven-day production baseline, then run the matching workload against staging. Confirm reconnect behavior, Realtime delivery, RLS for archived stories and shared notes, deletion, camera behavior on iOS Safari and Android Chrome, and service headroom. Record measured results and the chosen next load target with the release notes. No production capacity change is implied by this document.

<div align="center">

<img src="public/icon-512.png" alt="Gnouht Together" width="88" />

# Gnouht Together

**Know what your friends are up to. Make plans in a few taps.**

A Vietnamese-first social planner and personal organizer for trusted friends and classmates.

[Open the app](https://9try.gnouht.space) · [Install](#install) · [Developer docs](docs/architecture.md)

</div>

---

## Usage snapshot

<div align="center">

<img src="docs/usage-metrics.svg" alt="Registered users: 28 on Oct 12, 40 on Oct 16, and 43 on Oct 23, 2026. Estimated average: 5,408 app-host requests per day; 81,068 total requests." width="100%" />

</div>

*Snapshot: 23 Oct 2026 UTC. The requests counter includes static assets and automated traffic; its historical baseline is sampled, so the daily average is approximate.*

## Screens

<div align="center">

| Today | Calendar | Chat | Map |
|:---:|:---:|:---:|:---:|
| ![Today](docs/screenshots/hero.png) | ![Calendar](docs/screenshots/calendar.png) | ![Chat](docs/screenshots/chat.png) | ![Map](docs/screenshots/map.png) |

</div>

## What you can do

| | |
|---|---|
| **🟢 Presence & friends** — Share a mode, see close friends, and plan together. | **📸 Moments** — Share a daily photo with chosen friends. |
| **📅 Calendar** — Coordinate events, schedules, and imported timetables. | **💬 Chat** — Message friends and groups with replies, reactions, and photos. |
| **🗺️ Live map** — Share your latest location for a limited time with selected people. | **✅ Habits & notes** — Keep private routines and notes in one place. |
| **🔒 Privacy controls** — Choose who can see your activity and location. | **📲 Bilingual PWA** — Use in Vietnamese or English; install on mobile. |

## Run locally

Requires Node.js 22.12 or newer.

<pre><code>cp .env.example .env.local
npm ci
npm run dev</code></pre>

Add your Supabase URL and publishable key to <code>.env.local</code>. Never put service-role keys or other server secrets in a <code>VITE_*</code> variable.

## Stack

**Frontend:** React 19 · TypeScript 7 · Vite 8 · Tailwind 4<br/>
**Backend:** Supabase Auth · Postgres with RLS · Realtime · Storage · Edge Functions<br/>
**Maps & hosting:** MapLibre · OpenFreeMap · Cloudflare Workers

Feature modules live in <code>src/modules/</code>; the app registers them in <code>src/app/modules.ts</code>.

## Checks

<pre><code>npm run typecheck
npm test
npm run test:db
npm run build</code></pre>

Browser tests use Playwright: <code>npm run test:e2e</code>.

## Project guides

| Guide | Description |
|---|---|
| [Architecture](docs/architecture.md) | System overview |
| [Module guide](docs/module-guide.md) | Add a feature module |
| [Deployment](docs/deployment.md) | Release and hosting |
| [Permissions](docs/permission-matrix.md) | Access and privacy rules |
| [Backup & restore](docs/backup-restore.md) | Data recovery |
| [Costs & limits](docs/cost-and-limits.md) | Current resource notes |

## Install

- **Android / Chrome:** Open the browser menu and choose **Install app** or **Add to Home screen**.
- **iPhone / iPad:** In Safari, choose **Share → Add to Home Screen**. iOS push notifications require installation.

## Production safety

The live app is hosted at [9try.gnouht.space](https://9try.gnouht.space). See the [deployment guide](docs/deployment.md) before releasing.

> Do not change the <code>mcp.gnouht.space</code> DNS record, tunnel route, or Cloudflare Access policy. Never run <code>supabase db reset --linked</code> or database tests against production.

Map styles in <code>public/map/</code> derive from OpenFreeMap's Positron style. Copyright © 2024 MapTiler.com and OpenMapTiles contributors; © 2015 CartoDB Inc. BSD 3-Clause (code) and CC-BY 4.0 (design).

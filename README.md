<div align="center">

<!-- Replace with your actual app icon -->
<img src="public/icon-512.png" alt="Gnouht Together" width="120" />

# Gnouht Together

### See what your friends are up to. Meet up in a few taps.

A Vietnamese-first social planning & personal organizer for trusted friends and classmates.

[![Live App](https://img.shields.io/badge/🌐_Live_App-9try.gnouht.space-8B5CF6?style=for-the-badge)](https://9try.gnouht.space)
[![PWA](https://img.shields.io/badge/📱_PWA-Installable-10B981?style=for-the-badge)](#install)
[![Made with](https://img.shields.io/badge/React_19-TypeScript_7-3B82F6?style=for-the-badge&logo=react)](#tech-stack)

</div>

---

## 📸 App Preview

<!-- 
  🖼️ SCREENSHOT GUIDE — Replace these placeholders with real screenshots!
  
  Recommended shots (16:9 or phone aspect ratio):
  1. hero.png     — Mode screen showing friends' activities  
  2. calendar.png — Calendar week/month view with events
  3. chat.png     — Chat conversation with reactions & photos
  4. map.png      — Map with friend markers and mode rings
  5. moments.png  — Photo of the day on Mode screen
  
  How to capture:
  - Open https://9try.gnouht.space on Chrome
  - Use DevTools → Toggle Device Toolbar (Ctrl+Shift+M) → iPhone 14 Pro
  - Take screenshots with Ctrl+Shift+P → "Capture screenshot"
  - Save to docs/screenshots/ folder
  - For dark mode shots, toggle in app settings
-->

<div align="center">

| Mode (Home) | Calendar | Chat | Map |
|:-:|:-:|:-:|:-:|
| ![Mode Screen](docs/screenshots/hero.png) | ![Calendar](docs/screenshots/calendar.png) | ![Chat](docs/screenshots/chat.png) | ![Map](docs/screenshots/map.png) |
| *See who's free, studying, or grabbing coffee* | *Your schedule, timetable & shared events* | *Rich messaging with replies & reactions* | *Find friends sharing their location* |

</div>

---

## 🎬 How It Works — A Day with Gnouht

<div align="center">

```
  ┌─────────────┐         ┌─────────────┐         ┌─────────────┐
  │  ☕ Set your │         │  👀 Friends  │         │  📍 Meet up  │
  │    Mode     │────▶    │   see you   │────▶    │   IRL!      │
  │             │         │             │         │             │
  │ "Coffee" /  │         │ They reply, │         │ Share your  │
  │ "Studying"/ │         │ check your  │         │ location    │
  │ "Free"      │         │ calendar    │         │ for a set   │
  └─────────────┘         └─────────────┘         │ time        │
                                                  └─────────────┘
```

</div>

> **Less "are you free?" texts. More actually meeting up.** ✨

---

## 📊 Live Usage

<!-- 
  📈 Live metrics automatically updated from Supabase & Cloudflare
  Last verified: 2026-10-16
-->

<div align="center">

| 👤 Registered Users | 👁️ Page Views | 🌐 Total Requests |
|:---:|:---:|:---:|
| **`40`** | **`755+`** | **`≈ 62.5k`** |
| *active profiles* | *landing visits* | *all app host requests* |

> [!NOTE]
> These metrics are **live** on the [landing page](https://9try.gnouht.space) — refreshed automatically from Supabase RPC & Cloudflare Durable Objects.

</div>

### Daily Engagement

<!-- Replace placeholder values (—) with real numbers from your database -->

<div align="center">

| Metric | Value | Trend |
|:---|:---:|:---:|
| 💬 **Messages sent** (last 30d) | `—` | — |
| 📅 **Calendar events** created | `—` | — |
| 🟢 **Weekly active mode users** | `—` | — |
| 📸 **Moments shared** (last 7d) | `—` | — |
| 🗺️ **Location shares** (last 7d) | `—` | — |
| 👥 **Active conversations** | `—` | — |
| ✅ **Habit check-ins** (last 7d) | `—` | — |

</div>

---

## ✨ Features at a Glance

<div align="center">

```mermaid
graph LR
    subgraph "📱 5 Main Screens"
        A["🏠 Mode<br/><i>Who's doing what right now</i>"]
        B["📅 Calendar<br/><i>Events, timetable, .ics import</i>"]
        C["💬 Chat<br/><i>Friends & groups, photos, reactions</i>"]
        D["🗺️ Map<br/><i>Friends sharing location live</i>"]
        E["☰ Menu<br/><i>Habits, notes, groups, settings</i>"]
    end
    
    A --- B --- C --- D --- E
    
    style A fill:#f0fdf4,stroke:#22c55e,color:#000
    style B fill:#eff6ff,stroke:#3b82f6,color:#000
    style C fill:#fefce8,stroke:#eab308,color:#000
    style D fill:#fdf2f8,stroke:#ec4899,color:#000
    style E fill:#f5f3ff,stroke:#8b5cf6,color:#000
```

</div>

| Feature | What it does |
|:---|:---|
| **🟢 Mode** | One tap to show "Coffee ☕", "Studying 📚", or "Free 🟢". Friends who matter most appear on top with reasons. |
| **📸 Moments** | Photo of the day — visible for 24h to chosen friends, then gone. |
| **📅 Calendar** | Week list, month view, hour grid. Import `.ics` timetables. Share busy times with chosen friends. Private iCal feed. |
| **💬 Chat** | 1:1 and group. Replies, reactions, edit (15min), unsend. "Seen" status. Photo cards. Search. Mute. |
| **🗺️ Live Map** | Friends as face markers with mode rings. Time-limited sharing, you choose who sees you. Latest position only. |
| **👥 Friends & Groups** | Requests, invite links, block. Groups with roles, link expiry, archive. |
| **✅ Habits** | Daily/weekly tracking with streaks. |
| **📝 Notes** | Personal notes. |
| **🔔 Notifications** | In-app center + Web Push. Quiet hours. Per-category control. |
| **🔒 Privacy Screen** | See what others can see about you right now. One-tap stop for each. |
| **🌐 Bilingual** | Vietnamese & English. Switch anytime. |
| **📲 PWA** | Install on home screen. Works offline (app shell). No app store needed. |

---

## 🔒 Privacy by Design

<div align="center">

```mermaid
graph TD
    YOU["🧑 You"]
    
    YOU -->|"Private by default"| PRIVATE["🔐 Only You<br/>Notes, habits, private events"]
    YOU -->|"You choose who"| FRIENDS["💚 Chosen Friends<br/>Mode, 24h photos, location<br/>(time-limited), busy times"]
    YOU -->|"Never"| OTHERS["⬜ Everyone Else<br/>Sees nothing.<br/>No public profiles."]
    
    style PRIVATE fill:#1a1a2e,stroke:#6366f1,color:#e0e0e0
    style FRIENDS fill:#064e3b,stroke:#10b981,color:#e0e0e0
    style OTHERS fill:#374151,stroke:#6b7280,color:#9ca3af
    style YOU fill:#7c3aed,stroke:#7c3aed,color:#fff
```

</div>

> **Your location is only sent while you're actively sharing, to people you pick, and the server only keeps your latest position.** No tracking. No history.

---

## 🏗️ Architecture Overview

<div align="center">

```mermaid
graph TB
    subgraph "🖥️ Frontend — React 19 + TypeScript 7 + Vite 8"
        APP["App Shell<br/>Routes • Navigation • Search"]
        KERNEL["Kernel<br/>Auth • Session • Realtime • i18n • UI"]
        
        subgraph "📦 Modules (plug & play)"
            M1["presence"]
            M2["calendar"]
            M3["chat"]
            M4["location"]
            M5["friends"]
            M6["groups"]
            M7["moments"]
            M8["habits"]
            M9["notes"]
            M10["notifications"]
            M11["...+6 more"]
        end
    end
    
    subgraph "☁️ Backend — Supabase"
        AUTH["Auth<br/>Google • Email link • 6-digit code"]
        DB["Postgres + RLS<br/>Row-level security • SQL functions"]
        RT["Realtime<br/>Private channels per user"]
        STORE["Storage<br/>Photos (moments • chat)"]
        EDGE["Edge Functions<br/>Push • Calendar feed • Account deletion"]
    end
    
    APP --> KERNEL
    KERNEL --> M1 & M2 & M3 & M4 & M5 & M6 & M7 & M8 & M9 & M10 & M11
    M1 & M2 & M3 & M4 & M5 & M6 & M7 & M8 & M9 & M10 & M11 --> DB
    KERNEL --> AUTH
    KERNEL --> RT
    M3 & M7 --> STORE
    DB --> EDGE
    
    style APP fill:#dbeafe,stroke:#3b82f6,color:#000
    style KERNEL fill:#e0e7ff,stroke:#6366f1,color:#000
    style DB fill:#d1fae5,stroke:#10b981,color:#000
    style RT fill:#fef3c7,stroke:#f59e0b,color:#000
    style AUTH fill:#fce7f3,stroke:#ec4899,color:#000
```

</div>

### Module Architecture (Clean Architecture)

```mermaid
graph LR
    P["🖼️ Presentation<br/>React components & hooks"] --> A["⚙️ Application<br/>Service classes"]
    A --> D["🧩 Domain<br/>Entities & rules"]
    P --> I["🔌 Infrastructure<br/>Supabase repositories"]
    I --> D
    
    style P fill:#dbeafe,stroke:#3b82f6,color:#000
    style A fill:#fef3c7,stroke:#f59e0b,color:#000
    style D fill:#d1fae5,stroke:#10b981,color:#000
    style I fill:#f3e8ff,stroke:#8b5cf6,color:#000
```

> **Adding a feature = one new folder in `src/modules/` + one line in `src/app/modules.ts`.** Nothing else needs editing.

---

## <a name="install"></a> 📲 Install

<table>
<tr>
<td width="50%" align="center">

### Android / Chrome

Open menu → **"Install app"** or **"Add to Home screen"**

</td>
<td width="50%" align="center">

### iPhone / iPad (Safari)

**Share** → **"Add to Home Screen"**

*Push notifications require this step on iOS.*

</td>
</tr>
</table>

---

## <a name="tech-stack"></a> 🛠️ Tech Stack

<div align="center">

| Layer | Technology |
|:---|:---|
| **Frontend** | React 19 · TypeScript 7 · Vite 8 · Tailwind 4 · TanStack Query |
| **Backend** | Supabase (Auth · Postgres + RLS · Realtime · Storage · Edge Functions) |
| **Map** | MapLibre GL + OpenFreeMap (custom themed styles) |
| **PWA** | vite-plugin-pwa · Service Worker (app shell caching only) |
| **Tests** | Vitest · Playwright (mocked browser) · pgTAP (database) |
| **Deploy** | Cloudflare Workers static assets |

</div>

---

<details>
<summary><h2>🔧 For Developers</h2></summary>

### Run Locally

```bash
cp .env.example .env.local   # configure Supabase URL + key
npm ci
npm run dev                   # → http://localhost:5173
```

<details>
<summary>Local Supabase backend (Docker required)</summary>

```bash
# In another terminal — lightweight mode
npx supabase@2.119.0 start \
  --exclude realtime,storage-api,imgproxy,postgres-meta,studio,edge-runtime,logflare,vector,supavisor

# Get the local key
npx supabase@2.119.0 status --output env
# → Set VITE_SUPABASE_URL=http://127.0.0.1:54321
# → Set VITE_SUPABASE_PUBLISHABLE_KEY to the local key
```

Magic-link emails arrive in Mailpit at `http://127.0.0.1:55324`.

To stop: `npx supabase@2.119.0 stop`

> [!CAUTION]
> Never put `SECRET_KEY`, `SERVICE_ROLE_KEY` or `JWT_SECRET` in `VITE_*` variables.
> Never paste CLI status output in public logs.

</details>

### Validate

> Requires Node 22.12+ (see `.nvmrc`)

```bash
npm run typecheck              # TypeScript
npm test                       # Unit tests, architecture rules, map style checks
npm run test:db                # Migrations + pgTAP on embedded Postgres (no Docker)
npm run build                  # Production build
npm run test:e2e               # Browser tests (mocked backend, needs Playwright Chromium)
npm run test:e2e:preview       # Same suite against production build
```

<details>
<summary>Database tests on local Supabase</summary>

```bash
npx supabase@2.119.0 migration up --local
npm run test:db:local          # pgTAP on localhost only, rolls back
```

</details>

<details>
<summary>Push notification test (single machine)</summary>

```bash
DENO=/path/to/deno npm run test:push:local
```

Needs local stack, Deno 2, and internet access. See `docs/deployment.md`.

</details>

<details>
<summary>Location demo</summary>

Open `/demo/location` in development — a fictional two-person map demo (An & Bình). No auth or GPS needed. Omitted from production builds unless `VITE_ENABLE_DEMO=true`.

</details>

### Production

The app is served at `https://9try.gnouht.space/` via Cloudflare Workers. See [`docs/deployment.md`](docs/deployment.md) for deployment steps.

> [!WARNING]
> Do **not** modify the `mcp.gnouht.space` DNS record, tunnel route, or Cloudflare Access policy.
> Do **not** run `supabase db reset --linked` on the cloud project.
> Do **not** run database tests against production.

### Documentation

| Doc | Contents |
|:---|:---|
| [`architecture.md`](docs/architecture.md) | Full system architecture |
| [`module-guide.md`](docs/module-guide.md) | How to add a module |
| [`implementation-progress.md`](docs/implementation-progress.md) | What's implemented (with evidence) |
| [`master-plan.md`](docs/master-plan.md) | Architecture, UX, features, phases |
| [`feature-plan-2.md`](docs/feature-plan-2.md) | Landing, chat, map, .ics, expenses |
| [`permission-matrix.md`](docs/permission-matrix.md) | Who can do what |
| [`deployment.md`](docs/deployment.md) | Release & deploy steps |
| [`backup-restore.md`](docs/backup-restore.md) | Backup procedures |
| [`cost-and-limits.md`](docs/cost-and-limits.md) | Costs & quotas |

### Map Style

The map styles in `public/map/` are built by `scripts/build-map-style.mjs` from OpenFreeMap's Positron style, with app-themed colors. Copyright (c) 2024, MapTiler.com & OpenMapTiles contributors; Copyright (c) 2015, CartoDB Inc. BSD 3-Clause License (code) and CC-BY 4.0 (design).

</details>

---

<div align="center">

**Less "are you free?" texts. More actually meeting up.** 💜

[Try it now →](https://9try.gnouht.space)

</div>

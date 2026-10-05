# Gnouht Together

Vietnamese-first social planning and personal organization web app for trusted friends and families.

## Current implementation

- Responsive React + TypeScript shell with mobile navigation.
- Supabase magic-link authentication and profiles.
- Groups, private calendar events, personal tasks, in-app notifications.
- Explicit, expiring location-sharing sessions storing only the latest position.
- OOP domain rules for group ownership, meetup capacity/status, time ranges, recurring tasks and location expiry.
- Versioned Supabase schema for friendships, groups/invites, meetups/polls/RSVP/discussion, calendar sharing, tasks/notes, notifications/reminders and location sharing.
- RLS policies, indexes, RPCs and a server-side reminder worker.
- Architecture, permission, deployment, backup/restore and cost documentation.

## Run locally

```bash
cp .env.example .env.local
npm install
npm run dev
```

Apply Supabase migrations, then set `VITE_SUPABASE_URL` and `VITE_SUPABASE_PUBLISHABLE_KEY`.

## Validate

```bash
npm run typecheck
npm test
npm run build
```

## Production

Deploy `dist/` to Cloudflare and bind `gnouht.space`. Preserve the existing `mcp.gnouht.space` DNS/tunnel/Cloudflare Access configuration.

External setup is intentionally not faked: Supabase credentials, Cloudflare custom-domain binding, reminder cron authorization and VAPID keys must be configured separately.

See `docs/` for architecture, permissions, deployment and recovery guidance.

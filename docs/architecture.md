# Architecture

```mermaid
flowchart LR
Browser[React PWA] --> App[Application use cases]
App --> Domain[OOP domain]
App --> Ports[Repository interfaces]
Ports --> Supabase[Supabase adapters]
Supabase --> DB[(Postgres + RLS)]
Supabase --> Auth[Auth]
Supabase --> RT[Realtime]
Jobs[Scheduled Edge Function] --> DB
Browser --> Map[MapLibre]
Cloudflare --> Browser
```

Dependency direction points inward. Domain objects encapsulate group ownership, meetup capacity/status transitions, event time ranges, task completion and location-session expiry. DTO/database records are mapped explicitly at infrastructure boundaries.

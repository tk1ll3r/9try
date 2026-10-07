# Implementation plan

> Superseded by [master-plan.md](master-plan.md) on 2026-10-07. Kept for history.

## Architecture
React/TypeScript presentation -> application use cases -> OOP domain -> repository interfaces -> Supabase adapters.
The domain imports no React, browser, HTTP, or database SDK code. Supabase RLS is authoritative for access control.

## Sequence
1. Authentication and profiles.
2. Friendships, blocking, groups and invitations.
3. Meetups, polls, RSVP and discussion.
4. Calendar privacy and personal organizer.
5. In-app notifications and reminder queue.
6. Expiring location sharing.
7. PWA/web push and production hardening.

External-account setup is never simulated: Supabase, Cloudflare DNS, scheduled jobs and VAPID keys must be configured explicitly.

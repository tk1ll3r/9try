# Backup and restore

Enable managed database backups/PITR appropriate to the Supabase plan. Keep every schema change as a migration in Git. Back up user-critical Storage objects separately.

Recovery rehearsal: provision a clean test project, apply migrations, restore DB/Storage, rotate secrets if needed, run RLS/privacy tests and the critical user journey, then switch production configuration only after verification.

Location history is intentionally not retained; only the latest active-session position is stored.

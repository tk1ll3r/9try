-- Invite links and reminders call pgcrypto (gen_random_bytes, digest). With pgcrypto in the
-- `extensions` schema, the Supabase default, these functions cannot find it because they pin
-- search_path to public: "function gen_random_bytes(integer) does not exist".
alter function public.create_group_invite(uuid, integer, integer) set search_path = public, extensions;
alter function public.claim_group_invite(text) set search_path = public, extensions;
alter function public.schedule_personal_reminder(timestamptz, text, text, text) set search_path = public, extensions;

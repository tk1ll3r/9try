-- "Tải dữ liệu của bạn" gives a person everything the app stores about them. It now includes what
-- migrations 0040 to 0043 added: the photos of the day that are still there, what the person set for
-- their conversations, and the expense books of other people that they are in.
create or replace function public.export_my_data() returns jsonb
language sql stable security definer set search_path = '' as $$
select jsonb_build_object(
  'exported_at', now(),
  'profile', (select to_jsonb(p) from public.profiles p where p.id = auth.uid()),
  'friendships', coalesce((select jsonb_agg(to_jsonb(f)) from public.friendships f where auth.uid() in (f.requester_id, f.addressee_id)), '[]'::jsonb),
  'friend_pins', coalesce((select jsonb_agg(to_jsonb(x)) from public.friend_pins x where x.user_id = auth.uid()), '[]'::jsonb),
  'blocks', coalesce((select jsonb_agg(to_jsonb(b)) from public.blocks b where b.blocker_id = auth.uid()), '[]'::jsonb),
  'group_memberships', coalesce((select jsonb_agg(to_jsonb(gm)) from public.group_memberships gm where gm.user_id = auth.uid()), '[]'::jsonb),
  'meetup_invitations', coalesce((select jsonb_agg(to_jsonb(mi)) from public.meetup_invitees mi where mi.user_id = auth.uid()), '[]'::jsonb),
  'calendar_events', coalesce((select jsonb_agg(to_jsonb(e)) from public.calendar_events e where e.owner_id = auth.uid()), '[]'::jsonb),
  'tasks', coalesce((select jsonb_agg(to_jsonb(t)) from public.personal_tasks t where t.owner_id = auth.uid()), '[]'::jsonb),
  'routine_completions', coalesce((select jsonb_agg(to_jsonb(rc)) from public.routine_completions rc join public.personal_tasks t on t.id = rc.task_id where t.owner_id = auth.uid()), '[]'::jsonb),
  'notes', coalesce((select jsonb_agg(to_jsonb(n)) from public.personal_notes n where n.owner_id = auth.uid()), '[]'::jsonb),
  'notifications', coalesce((select jsonb_agg(to_jsonb(n)) from public.notifications n where n.user_id = auth.uid()), '[]'::jsonb),
  'notification_preferences', (select to_jsonb(x) from public.notification_preferences x where x.user_id = auth.uid()),
  -- The name and the dates of each device, without the keys that would let someone push to it.
  'push_devices', coalesce((select jsonb_agg(jsonb_build_object('label', x.label, 'language', x.language, 'created_at', x.created_at, 'last_seen_at', x.last_seen_at)) from public.push_subscriptions x where x.user_id = auth.uid()), '[]'::jsonb),
  'messages_sent', coalesce((select jsonb_agg(to_jsonb(m)) from public.messages m where m.sender_id = auth.uid()), '[]'::jsonb),
  'message_reactions', coalesce((select jsonb_agg(to_jsonb(x)) from public.message_reactions x where x.user_id = auth.uid()), '[]'::jsonb),
  'conversation_settings', coalesce((select jsonb_agg(to_jsonb(x)) from public.conversation_settings x where x.user_id = auth.uid()), '[]'::jsonb),
  'activity_mode', (select to_jsonb(x) from public.activity_modes x where x.user_id = auth.uid()),
  -- The photos of the day that have not ended yet, with who each was for. The files themselves are in the app until they end.
  'moments', coalesce((select jsonb_agg(to_jsonb(m) || jsonb_build_object(
      'viewers', coalesce((select jsonb_agg(v.user_id) from public.moment_viewers v where v.moment_id = m.id), '[]'::jsonb)))
    from public.moments m where m.owner_id = auth.uid()), '[]'::jsonb),
  'presence_settings', (select to_jsonb(x) from public.presence_settings x where x.user_id = auth.uid()),
  'presence_viewers', coalesce((select jsonb_agg(to_jsonb(x)) from public.presence_viewers x where x.user_id = auth.uid()), '[]'::jsonb),
  'schedule_requests', coalesce((select jsonb_agg(to_jsonb(x)) from public.schedule_requests x where auth.uid() in (x.requester_id, x.owner_id)), '[]'::jsonb),
  'schedule_grants', coalesce((select jsonb_agg(to_jsonb(x)) from public.schedule_grants x where auth.uid() in (x.owner_id, x.viewer_id)), '[]'::jsonb),
  'location_sessions', coalesce((select jsonb_agg(to_jsonb(s)) from public.location_sessions s where s.owner_id = auth.uid()), '[]'::jsonb),
  'features', coalesce((select jsonb_agg(to_jsonb(g)) from public.feature_grants g where g.user_id = auth.uid()), '[]'::jsonb),
  -- A book belongs to the one who keeps it, whether or not the capability holds today.
  'expense_books', coalesce((select jsonb_agg(to_jsonb(b) || jsonb_build_object(
      'participants', coalesce((select jsonb_agg(to_jsonb(x)) from public.expense_participants x where x.book_id = b.id), '[]'::jsonb),
      'members', coalesce((select jsonb_agg(to_jsonb(x)) from public.expense_book_members x where x.book_id = b.id), '[]'::jsonb),
      'categories', coalesce((select jsonb_agg(to_jsonb(x)) from public.expense_categories x where x.book_id = b.id), '[]'::jsonb),
      'outings', coalesce((select jsonb_agg(to_jsonb(x)) from public.expense_outings x where x.book_id = b.id), '[]'::jsonb),
      'expenses', coalesce((select jsonb_agg(private.expense_snapshot(x.id)) from public.expenses x where x.book_id = b.id), '[]'::jsonb),
      'settlements', coalesce((select jsonb_agg(to_jsonb(x)) from public.expense_settlements x where x.book_id = b.id), '[]'::jsonb),
      'history', coalesce((select jsonb_agg(to_jsonb(x)) from public.expense_audit_log x where x.book_id = b.id), '[]'::jsonb)))
    from public.expense_books b where b.owner_id = auth.uid()), '[]'::jsonb),
  -- A book of someone else that the person is in: what they are there, and the entries that name them.
  'expense_memberships', coalesce((select jsonb_agg(jsonb_build_object(
      'book_id', b.id, 'book', b.name, 'role', m.role, 'status', m.status, 'since', m.created_at,
      'expenses', coalesce((select jsonb_agg(private.expense_snapshot(x.id)) from public.expenses x
        where x.book_id = b.id and m.participant_id is not null and (x.payer_id = m.participant_id or x.created_by = auth.uid()
          or exists(select 1 from public.expense_splits s where s.expense_id = x.id and s.participant_id = m.participant_id and s.amount > 0))), '[]'::jsonb),
      'settlements', coalesce((select jsonb_agg(to_jsonb(x)) from public.expense_settlements x
        where x.book_id = b.id and m.participant_id in (x.from_participant_id, x.to_participant_id)), '[]'::jsonb)))
    from public.expense_book_members m join public.expense_books b on b.id = m.book_id
    where m.user_id = auth.uid() and b.owner_id <> auth.uid()), '[]'::jsonb)
)
$$;

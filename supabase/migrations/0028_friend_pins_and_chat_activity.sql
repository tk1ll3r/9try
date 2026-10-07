-- Two things the Mode screen sorts friends by: who the user pinned, and how much two people talk.

-- A pin marks a close friend. It is private to the person who set it.
create table public.friend_pins (
  user_id uuid not null references public.profiles(id) on delete cascade,
  friend_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (user_id, friend_id)
);
alter table public.friend_pins enable row level security;
revoke all on public.friend_pins from anon, authenticated;
grant select on public.friend_pins to authenticated;

create policy friend_pins_owner_read on public.friend_pins
for select to authenticated using (user_id = (select auth.uid()));

-- Rows change only here: a pin needs an accepted friendship, removing one needs nothing.
create function public.set_friend_pin(p_friend_id uuid, p_pinned boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if (select auth.uid()) is null then raise exception 'not authenticated'; end if;
  if not p_pinned then
    delete from public.friend_pins where user_id = (select auth.uid()) and friend_id = p_friend_id;
    return;
  end if;
  if not private.are_friends((select auth.uid()), p_friend_id) then raise exception 'not friends'; end if;
  insert into public.friend_pins(user_id, friend_id) values ((select auth.uid()), p_friend_id)
  on conflict do nothing;
end $$;

revoke execute on function public.set_friend_pin(uuid, boolean) from public, anon;
grant execute on function public.set_friend_pin(uuid, boolean) to authenticated;

-- Unfriending or blocking ends what the two shared (migration 0015). Pins go the same way.
create or replace function private.revoke_relationship_grants(a uuid, b uuid) returns void
language sql set search_path = '' as $$
  delete from public.availability_shares s
  where (s.owner_id = a and s.user_id = b) or (s.owner_id = b and s.user_id = a);

  delete from public.location_recipients r
  using public.location_sessions s
  where r.session_id = s.id
    and ((s.owner_id = a and r.user_id = b) or (s.owner_id = b and r.user_id = a));

  delete from public.event_shares e
  using public.calendar_events c
  where e.event_id = c.id
    and ((c.owner_id = a and e.user_id = b) or (c.owner_id = b and e.user_id = a));

  delete from public.friend_pins p
  where (p.user_id = a and p.friend_id = b) or (p.user_id = b and p.friend_id = a);
$$;

-- list_conversations gains recent_messages: how many messages the conversation had in the last 14 days.
-- A function cannot change its columns in place, so it is dropped and made again in this transaction.
-- An older client ignores the extra column.
drop function public.list_conversations();
create function public.list_conversations()
returns table(
  id uuid,
  kind text,
  title text,
  other_user_id uuid,
  group_id uuid,
  last_message_at timestamptz,
  last_message_body text,
  unread_count integer,
  recent_messages integer
)
language sql stable security definer set search_path = '' as $$
  select
    c.id,
    c.kind,
    case when c.kind = 'group' then g.name else coalesce(nullif(p.display_name, ''), p.username, 'Người dùng') end,
    p.id,
    c.group_id,
    c.last_message_at,
    (select m.body from public.messages m where m.conversation_id = c.id order by m.created_at desc limit 1),
    (select count(*)::integer from public.messages m
      where m.conversation_id = c.id and m.sender_id <> auth.uid()
        and m.created_at > coalesce(
          (select r.last_read_at from public.conversation_reads r where r.conversation_id = c.id and r.user_id = auth.uid()),
          '-infinity'::timestamptz)),
    (select count(*)::integer from public.messages m
      where m.conversation_id = c.id and m.created_at > now() - interval '14 days')
  from public.conversations c
  left join public.groups g on g.id = c.group_id
  left join public.profiles p on c.kind = 'direct' and p.id = case when c.user_a = auth.uid() then c.user_b else c.user_a end
  where private.is_participant(c.id, auth.uid())
    and (c.kind = 'group' or not private.is_blocked_between(c.user_a, c.user_b))
    and (c.kind = 'direct' or g.archived_at is null)
  order by c.last_message_at desc nulls last, c.created_at desc
$$;

revoke execute on function public.list_conversations() from public, anon;
grant execute on function public.list_conversations() to authenticated;

-- Chat: one conversation per pair of friends, and one per group.
-- The tables have no policies. Everything goes through the functions below, which check that
-- the caller takes part in the conversation. Who takes part is looked up on every call, so
-- leaving a group or ending a friendship takes effect at once.
-- Messages are protected by these access rules. They are not end-to-end encrypted.

create table public.conversations(
  id uuid primary key default gen_random_uuid(),
  kind text not null check (kind in ('direct', 'group')),
  group_id uuid unique references public.groups(id) on delete cascade,
  -- A direct conversation stores its two people in id order, so a pair has exactly one.
  user_a uuid references public.profiles(id) on delete cascade,
  user_b uuid references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  last_message_at timestamptz,
  unique (user_a, user_b),
  check (
    (kind = 'direct' and user_a < user_b and group_id is null)
    or (kind = 'group' and group_id is not null and user_a is null and user_b is null)
  )
);

create table public.messages(
  -- Made by the sender's device, so sending again after a lost reply cannot post twice.
  id uuid primary key,
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete cascade,
  body text not null check (length(trim(body)) between 1 and 4000),
  -- The moment of the insert, not of the transaction start, so messages keep their order.
  created_at timestamptz not null default clock_timestamp()
);
create index messages_by_conversation on public.messages(conversation_id, created_at desc);

create table public.conversation_reads(
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  last_read_at timestamptz not null default clock_timestamp(),
  primary key (conversation_id, user_id)
);

alter table public.conversations enable row level security;
alter table public.messages enable row level security;
alter table public.conversation_reads enable row level security;

create or replace function private.is_participant(p_conversation_id uuid, p_user_id uuid) returns boolean
language sql stable set search_path = '' as $$
  select exists(
    select 1 from public.conversations c
    where c.id = p_conversation_id
      and (
        (c.kind = 'direct' and p_user_id in (c.user_a, c.user_b))
        or (c.kind = 'group' and exists(
          select 1 from public.group_memberships m where m.group_id = c.group_id and m.user_id = p_user_id))
      )
  )
$$;

-- Everyone who takes part in a conversation right now.
create or replace function private.participants(p_conversation_id uuid) returns setof uuid
language sql stable set search_path = '' as $$
  select unnest(array[c.user_a, c.user_b]) from public.conversations c where c.id = p_conversation_id and c.kind = 'direct'
  union
  select m.user_id from public.conversations c join public.group_memberships m on m.group_id = c.group_id
  where c.id = p_conversation_id and c.kind = 'group'
$$;

create or replace function public.open_direct_conversation(p_user_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); cid uuid;
begin
  if me is null then raise exception 'not authenticated'; end if;
  if not private.can_contact(me, p_user_id) then raise exception 'conversation unavailable'; end if;

  insert into public.conversations(kind, user_a, user_b)
  values ('direct', least(me, p_user_id), greatest(me, p_user_id))
  on conflict (user_a, user_b) do nothing;

  select c.id into cid from public.conversations c
  where c.user_a = least(me, p_user_id) and c.user_b = greatest(me, p_user_id);
  return cid;
end $$;

create or replace function public.open_group_conversation(p_group_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare cid uuid;
begin
  if auth.uid() is null or not public.is_group_member(p_group_id, auth.uid()) then
    raise exception 'conversation unavailable';
  end if;

  insert into public.conversations(kind, group_id) values ('group', p_group_id)
  on conflict (group_id) do nothing;

  select c.id into cid from public.conversations c where c.group_id = p_group_id;
  return cid;
end $$;

create or replace function public.send_message(p_id uuid, p_conversation_id uuid, p_body text) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); conv public.conversations%rowtype; heading text; recipient uuid;
begin
  if me is null then raise exception 'not authenticated'; end if;
  select * into conv from public.conversations c where c.id = p_conversation_id;
  if conv.id is null or not private.is_participant(p_conversation_id, me) then raise exception 'not a participant'; end if;
  -- Old messages stay readable after a friendship ends, but nothing new can be sent.
  if conv.kind = 'direct' and not private.can_contact(conv.user_a, conv.user_b) then raise exception 'conversation closed'; end if;

  insert into public.messages(id, conversation_id, sender_id, body)
  values (p_id, p_conversation_id, me, trim(p_body))
  on conflict (id) do nothing;
  if not found then return; end if;

  update public.conversations c set last_message_at = clock_timestamp() where c.id = p_conversation_id;
  insert into public.conversation_reads(conversation_id, user_id) values (p_conversation_id, me)
  on conflict (conversation_id, user_id) do update set last_read_at = clock_timestamp();

  if conv.kind = 'group' then
    select g.name into heading from public.groups g where g.id = conv.group_id;
  else
    select coalesce(nullif(p.display_name, ''), p.username, 'Một người bạn') into heading from public.profiles p where p.id = me;
  end if;

  for recipient in select private.participants(p_conversation_id) loop
    perform private.emit(recipient, 'chat');
    if recipient <> me then
      -- One notification per conversation until it is read. It carries no message text.
      insert into public.notifications(user_id, category, title, body, action_path, dedupe_key)
      values (recipient, 'chat_message', 'Tin nhắn mới · ' || heading, '', '/chat/' || p_conversation_id::text,
        'chat:' || p_conversation_id::text || ':' || recipient::text)
      on conflict (dedupe_key) do nothing;
    end if;
  end loop;
end $$;

create or replace function public.mark_conversation_read(p_conversation_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid();
begin
  if me is null or not private.is_participant(p_conversation_id, me) then raise exception 'not a participant'; end if;

  insert into public.conversation_reads(conversation_id, user_id) values (p_conversation_id, me)
  on conflict (conversation_id, user_id) do update set last_read_at = clock_timestamp();

  -- The notification is gone once the conversation is read, and so is its pending push.
  delete from public.notifications n
  where n.dedupe_key = 'chat:' || p_conversation_id::text || ':' || me::text;
  update public.reminders r set status = 'canceled'
  where r.idempotency_key = 'chat:' || p_conversation_id::text || ':' || me::text and r.status = 'pending';

  perform private.emit(me, 'chat');
  perform private.emit(me, 'notifications');
end $$;

create or replace function public.list_messages(
  p_conversation_id uuid,
  p_before timestamptz default null,
  p_limit integer default 50
)
returns table(id uuid, sender_id uuid, sender_name text, body text, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not private.is_participant(p_conversation_id, auth.uid()) then raise exception 'not a participant'; end if;

  return query
  select m.id, m.sender_id, coalesce(nullif(p.display_name, ''), p.username, 'Người dùng'), m.body, m.created_at
  from public.messages m
  join public.profiles p on p.id = m.sender_id
  where m.conversation_id = p_conversation_id and (p_before is null or m.created_at < p_before)
  order by m.created_at desc
  limit least(greatest(p_limit, 1), 100);
end $$;

-- The caller's conversations, newest first. A direct conversation disappears from the list
-- when either person blocks the other.
create or replace function public.list_conversations()
returns table(
  id uuid,
  kind text,
  title text,
  other_user_id uuid,
  group_id uuid,
  last_message_at timestamptz,
  last_message_body text,
  unread_count integer
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
          '-infinity'::timestamptz))
  from public.conversations c
  left join public.groups g on g.id = c.group_id
  left join public.profiles p on c.kind = 'direct' and p.id = case when c.user_a = auth.uid() then c.user_b else c.user_a end
  where private.is_participant(c.id, auth.uid())
    and (c.kind = 'group' or not private.is_blocked_between(c.user_a, c.user_b))
    and (c.kind = 'direct' or g.archived_at is null)
  order by c.last_message_at desc nulls last, c.created_at desc
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.open_direct_conversation(uuid)', 'public.open_group_conversation(uuid)',
    'public.send_message(uuid, uuid, text)', 'public.mark_conversation_read(uuid)',
    'public.list_messages(uuid, timestamptz, integer)', 'public.list_conversations()'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

-- Temporary conversations on an event, a meetup or an activity mode.
--
-- The owner of the thing turns a discussion on. The people who may see the thing can then join it and
-- write, with the same messages, unread counts and notifications as any other conversation. A room
-- is a third kind of conversation next to 'direct' and 'group'.
--
-- Who may be in a room is asked again on every read and every message, from the thing itself: the
-- people a meetup invites, the friends an event is shown to, the friends who may see a mode. Taking
-- someone off the invitation, or ending the friendship, ends their access to the room with it.
--
-- A room closes by the clock: a day after its event or meetup ends, or when its mode ends. Its owner
-- can close it sooner. A closed room can be read for seven days and takes no new message, also not
-- through a direct call. After the seven days the room and its messages are deleted.

-- 1. The shape of a room. The two check constraints of migration 0020 are replaced by named ones.
do $$
declare c record;
begin
  for c in select conname from pg_constraint where conrelid = 'public.conversations'::regclass and contype = 'c' loop
    execute format('alter table public.conversations drop constraint %I', c.conname);
  end loop;
end $$;

alter table public.conversations
  add column source_kind text,
  -- The event, the meetup, or for a mode the person whose mode it is.
  add column source_id uuid,
  -- Which time of a repeating event ("2026-10-08"), or which run of a mode. Empty otherwise.
  add column occurrence_key text not null default '',
  add column owner_id uuid references public.profiles(id) on delete cascade,
  add column title text,
  add column closes_at timestamptz,
  add column closed_at timestamptz;

alter table public.conversations add constraint conversations_kind_check check (kind in ('direct', 'group', 'room'));
alter table public.conversations add constraint conversations_shape_check check (
  (kind = 'direct' and user_a < user_b and group_id is null and source_kind is null)
  or (kind = 'group' and group_id is not null and user_a is null and user_b is null and source_kind is null)
  or (kind = 'room' and group_id is null and user_a is null and user_b is null
      and source_kind in ('event', 'meetup', 'mode') and source_id is not null and owner_id is not null
      and closes_at is not null and length(trim(title)) between 1 and 240)
);
create unique index conversations_one_room_per_source on public.conversations(source_kind, source_id, occurrence_key) where kind = 'room';

-- Who joined a room. Leaving and being removed are kept apart: someone who left may come back,
-- someone the owner removed may not.
create table public.room_members (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  joined_at timestamptz not null default now(),
  -- No notification for new messages; the unread count still shows.
  muted boolean not null default false,
  left_at timestamptz,
  removed_at timestamptz,
  primary key (conversation_id, user_id)
);
create index room_members_by_user on public.room_members(user_id);
alter table public.room_members enable row level security;
revoke all on public.room_members from anon, authenticated;

-- 2. Who may be in a room right now, read from the thing the room belongs to.
create function private.in_room_audience(p_conversation_id uuid, p_user_id uuid) returns boolean
language sql stable set search_path = '' as $$
  select case c.source_kind
    when 'meetup' then exists(
      select 1 from public.meetups m
      where m.id = c.source_id and (m.organizer_id = p_user_id
        or exists(select 1 from public.meetup_invitees i where i.meetup_id = m.id and i.user_id = p_user_id)))
    when 'event' then exists(
      select 1 from public.calendar_events e
      where e.id = c.source_id and (e.owner_id = p_user_id
        or (e.visibility = 'selected_friends' and private.can_contact(e.owner_id, p_user_id)
            and exists(select 1 from public.event_shares s where s.event_id = e.id and s.user_id = p_user_id))
        or (e.visibility = 'group' and exists(
              select 1 from public.event_shares s
              join public.group_memberships mine on mine.group_id = s.group_id and mine.user_id = p_user_id
              join public.group_memberships theirs on theirs.group_id = s.group_id and theirs.user_id = e.owner_id
              where s.event_id = e.id))
        -- An event open to everyone has a room for its owner's friends, not for the whole app.
        or (e.visibility = 'public' and private.can_contact(e.owner_id, p_user_id))))
    when 'mode' then c.source_id = p_user_id or private.can_contact(c.source_id, p_user_id)
    else false
  end
  from public.conversations c where c.id = p_conversation_id and c.kind = 'room'
$$;

create function private.room_is_open(p_conversation_id uuid) returns boolean
language sql stable set search_path = '' as $$
  select exists(select 1 from public.conversations c where c.id = p_conversation_id and c.kind = 'room' and c.closed_at is null and c.closes_at > now())
$$;

-- Taking part in a room: having joined, not having left or been removed, and still being someone
-- who may see what the room is about.
create or replace function private.is_participant(p_conversation_id uuid, p_user_id uuid) returns boolean
language sql stable set search_path = '' as $$
  select exists(
    select 1 from public.conversations c
    where c.id = p_conversation_id
      and (
        (c.kind = 'direct' and p_user_id in (c.user_a, c.user_b))
        or (c.kind = 'group' and exists(
          select 1 from public.group_memberships m where m.group_id = c.group_id and m.user_id = p_user_id))
        or (c.kind = 'room' and private.in_room_audience(c.id, p_user_id) and exists(
          select 1 from public.room_members m
          where m.conversation_id = c.id and m.user_id = p_user_id and m.left_at is null and m.removed_at is null))
      )
  )
$$;

create or replace function private.participants(p_conversation_id uuid) returns setof uuid
language sql stable set search_path = '' as $$
  select unnest(array[c.user_a, c.user_b]) from public.conversations c where c.id = p_conversation_id and c.kind = 'direct'
  union
  select m.user_id from public.conversations c join public.group_memberships m on m.group_id = c.group_id
  where c.id = p_conversation_id and c.kind = 'group'
  union
  select m.user_id from public.conversations c join public.room_members m on m.conversation_id = c.id
  where c.id = p_conversation_id and c.kind = 'room' and m.left_at is null and m.removed_at is null
    and private.in_room_audience(c.id, m.user_id)
$$;

-- Everyone who may join a room, joined or not. They are told when it opens and when it closes.
create function private.room_audience(p_conversation_id uuid) returns setof uuid
language sql stable set search_path = '' as $$
  select m.organizer_id from public.conversations c join public.meetups m on m.id = c.source_id where c.id = p_conversation_id and c.source_kind = 'meetup'
  union
  select i.user_id from public.conversations c join public.meetup_invitees i on i.meetup_id = c.source_id where c.id = p_conversation_id and c.source_kind = 'meetup'
  union
  select e.owner_id from public.conversations c join public.calendar_events e on e.id = c.source_id where c.id = p_conversation_id and c.source_kind = 'event'
  union
  select s.user_id from public.conversations c join public.event_shares s on s.event_id = c.source_id
  where c.id = p_conversation_id and c.source_kind = 'event' and s.user_id is not null and private.in_room_audience(c.id, s.user_id)
  union
  select gm.user_id from public.conversations c join public.event_shares s on s.event_id = c.source_id join public.group_memberships gm on gm.group_id = s.group_id
  where c.id = p_conversation_id and c.source_kind = 'event' and private.in_room_audience(c.id, gm.user_id)
  union
  select c.source_id from public.conversations c where c.id = p_conversation_id and c.source_kind = 'mode'
  union
  select case when f.requester_id = c.source_id then f.addressee_id else f.requester_id end
  from public.conversations c join public.friendships f on f.status = 'accepted' and c.source_id in (f.requester_id, f.addressee_id)
  where c.id = p_conversation_id and c.source_kind = 'mode'
    and private.can_contact(c.source_id, case when f.requester_id = c.source_id then f.addressee_id else f.requester_id end)
$$;

create function private.emit_room(p_conversation_id uuid) returns void
language sql set search_path = '' as $$
  select private.emit(person, 'chat') from private.room_audience(p_conversation_id) person;
$$;

-- 3. Turning a discussion on. Only the owner of the thing can: the event's owner, the meetup's
-- organizer, the person whose mode it is. `p_occurrence` names one time of a repeating event.
-- Returns the room; calling again returns the same room. An opening message is the room's first.
create function public.open_room(p_source_kind text, p_source_id uuid, p_occurrence date default null, p_message text default null) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid()); room uuid; room_title text; ends timestamptz; key text := '';
  event public.calendar_events%rowtype; meetup public.meetups%rowtype; running public.activity_modes%rowtype; told uuid;
begin
  if me is null then raise exception 'not authenticated'; end if;

  if p_source_kind = 'meetup' then
    select * into meetup from public.meetups m where m.id = p_source_id and m.organizer_id = me;
    if meetup.id is null or meetup.status in ('canceled', 'completed') then raise exception 'room unavailable'; end if;
    room_title := meetup.title;
    -- A meetup without a time yet gets a week; the room follows the time once it is confirmed.
    ends := coalesce(meetup.end_at, now() + interval '7 days') + interval '24 hours';
  elsif p_source_kind = 'event' then
    select * into event from public.calendar_events e where e.id = p_source_id and e.owner_id = me;
    -- A room on an event nobody else sees would have nobody to join it.
    if event.id is null or event.visibility = 'only_me' then raise exception 'room unavailable'; end if;
    room_title := event.title;
    -- Only a repeating event has more than one time to tell apart.
    if event.recurrence_rule is null then p_occurrence := null; end if;
    if event.recurrence_rule is not null then
      if p_occurrence is null or p_occurrence < coalesce(event.all_day_start, (event.start_at at time zone event.timezone)::date)
         or (event.recurrence_until is not null and p_occurrence > event.recurrence_until) then
        raise exception 'room unavailable';
      end if;
      key := p_occurrence::text;
    end if;
    ends := interval '24 hours' + case
      when event.event_kind = 'all_day' then
        (coalesce(p_occurrence, event.all_day_start) + (event.all_day_end_exclusive - event.all_day_start))::timestamp at time zone event.timezone
      when event.recurrence_rule is not null then
        ((p_occurrence + (event.start_at at time zone event.timezone)::time) at time zone event.timezone) + (event.end_at - event.start_at)
      else event.end_at end;
  elsif p_source_kind = 'mode' then
    select * into running from public.activity_modes a where a.user_id = me and a.expires_at > now();
    if running.user_id is null or p_source_id is distinct from me then raise exception 'room unavailable'; end if;
    -- The text names the activity by its key, as mode alerts do; the app knows its name.
    room_title := 'mode:' || running.mode;
    ends := running.expires_at;
    key := extract(epoch from running.updated_at)::bigint::text;
  else
    raise exception 'room unavailable';
  end if;
  if ends <= now() then raise exception 'room unavailable'; end if;

  select c.id into room from public.conversations c where c.kind = 'room' and c.source_kind = p_source_kind and c.source_id = p_source_id and c.occurrence_key = key;
  if room is null then
    insert into public.conversations(kind, source_kind, source_id, occurrence_key, owner_id, title, closes_at)
    values ('room', p_source_kind, p_source_id, key, me, room_title, ends) returning id into room;
    insert into public.room_members(conversation_id, user_id) values (room, me);

    -- The people a meetup invites and the friends an event is shown to are told once. A mode's room
    -- is not announced: it shows on the Mode screen, next to the mode.
    if p_source_kind in ('meetup', 'event') then
      for told in select person from private.room_audience(room) person where person <> me loop
        insert into public.notifications(user_id, category, title, body, action_path, dedupe_key)
        values (told, 'chat_message', private.display_name_of(me) || ' mở thảo luận', room_title, '/chat/' || room::text, 'room:' || room::text || ':' || told::text)
        on conflict (dedupe_key) do nothing;
      end loop;
    end if;
    perform private.emit_room(room);
  end if;

  if nullif(trim(coalesce(p_message, '')), '') is not null and private.room_is_open(room) then
    perform public.send_message(gen_random_uuid(), room, p_message);
  end if;
  return room;
end $$;

create function public.join_room(p_conversation_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := (select auth.uid());
begin
  if me is null or not private.in_room_audience(p_conversation_id, me) then raise exception 'room unavailable'; end if;
  if not private.room_is_open(p_conversation_id) then raise exception 'conversation closed'; end if;
  if exists(select 1 from public.room_members m where m.conversation_id = p_conversation_id and m.user_id = me and m.removed_at is not null) then
    raise exception 'removed from room';
  end if;
  insert into public.room_members(conversation_id, user_id) values (p_conversation_id, me)
  on conflict (conversation_id, user_id) do update set left_at = null;
  perform private.emit_room(p_conversation_id);
end $$;

create function public.leave_room(p_conversation_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := (select auth.uid());
begin
  update public.room_members set left_at = now() where conversation_id = p_conversation_id and user_id = me and left_at is null;
  if not found then raise exception 'not a participant'; end if;
  -- What the room said to this person leaves their inbox with them.
  delete from public.notifications n where n.dedupe_key in ('chat:' || p_conversation_id::text || ':' || me::text, 'room:' || p_conversation_id::text || ':' || me::text);
  perform private.emit(me, 'chat');
  perform private.emit(me, 'notifications');
  perform private.emit_room(p_conversation_id);
end $$;

create function public.mute_room(p_conversation_id uuid, p_muted boolean) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.room_members set muted = coalesce(p_muted, false)
  where conversation_id = p_conversation_id and user_id = (select auth.uid()) and left_at is null and removed_at is null;
  if not found then raise exception 'not a participant'; end if;
  perform private.emit((select auth.uid()), 'chat');
end $$;

-- The owner takes someone out of the room. They cannot join it again.
create function public.remove_room_member(p_conversation_id uuid, p_user_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := (select auth.uid());
begin
  if not exists(select 1 from public.conversations c where c.id = p_conversation_id and c.kind = 'room' and c.owner_id = me) or p_user_id = me then
    raise exception 'room unavailable';
  end if;
  insert into public.room_members(conversation_id, user_id, removed_at) values (p_conversation_id, p_user_id, now())
  on conflict (conversation_id, user_id) do update set removed_at = now();
  delete from public.notifications n where n.dedupe_key in ('chat:' || p_conversation_id::text || ':' || p_user_id::text, 'room:' || p_conversation_id::text || ':' || p_user_id::text);
  perform private.emit(p_user_id, 'chat');
  perform private.emit(p_user_id, 'notifications');
  perform private.emit_room(p_conversation_id);
end $$;

-- The owner closes the room before its time. It can still be read for seven days.
create function public.close_room(p_conversation_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.conversations set closed_at = now()
  where id = p_conversation_id and kind = 'room' and owner_id = (select auth.uid()) and closed_at is null;
  if not found then raise exception 'room unavailable'; end if;
  perform private.emit_room(p_conversation_id);
end $$;

-- The rooms the caller may be in: the ones they joined, and the open ones they could join. With
-- arguments, only the room with that id, or the room of that thing. A room whose thing the caller
-- may no longer see is not in the result, joined or not.
create function public.list_rooms(p_conversation_id uuid default null, p_source_kind text default null, p_source_id uuid default null, p_occurrence date default null)
returns table(id uuid, source_kind text, source_id uuid, occurrence_key text, title text, owner_id uuid, owner_name text,
  closes_at timestamptz, closed boolean, joined boolean, muted boolean, removed boolean, member_count integer)
language sql stable security definer set search_path = '' as $$
  select c.id, c.source_kind, c.source_id, c.occurrence_key, c.title, c.owner_id, private.display_name_of(c.owner_id),
    c.closes_at, c.closed_at is not null or c.closes_at <= now(),
    mine.user_id is not null and mine.left_at is null and mine.removed_at is null, coalesce(mine.muted, false), coalesce(mine.removed_at is not null, false),
    (select count(*)::integer from public.room_members m where m.conversation_id = c.id and m.left_at is null and m.removed_at is null)
  from public.conversations c
  left join public.room_members mine on mine.conversation_id = c.id and mine.user_id = (select auth.uid())
  where c.kind = 'room'
    and (p_conversation_id is null or c.id = p_conversation_id)
    and (p_source_kind is null or (c.source_kind = p_source_kind and c.source_id = p_source_id
      -- For a mode, the room of the run that is going on now.
      and case when p_source_kind = 'mode' then c.closed_at is null and c.closes_at > now() else c.occurrence_key = coalesce(p_occurrence::text, '') end))
    and private.in_room_audience(c.id, (select auth.uid()))
    -- A closed room is listed only for someone who was in it: there is nothing left to join.
    and ((c.closed_at is null and c.closes_at > now()) or (mine.user_id is not null and mine.left_at is null and mine.removed_at is null))
  order by c.closes_at
$$;

create function public.list_room_members(p_conversation_id uuid)
returns table(user_id uuid, display_name text, avatar_url text, is_owner boolean)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  if not private.is_participant(p_conversation_id, (select auth.uid())) then raise exception 'not a participant'; end if;
  return query
  select p.id, coalesce(nullif(p.display_name, ''), p.username, 'Người dùng'), p.avatar_url, p.id = c.owner_id
  from public.conversations c
  join public.room_members m on m.conversation_id = c.id and m.left_at is null and m.removed_at is null
  join public.profiles p on p.id = m.user_id
  where c.id = p_conversation_id and private.in_room_audience(c.id, m.user_id)
  order by p.id <> c.owner_id, m.joined_at;
end $$;

-- 4. Messages. A closed room takes none; a muted member gets no notification.
create or replace function public.send_message(p_id uuid, p_conversation_id uuid, p_body text) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := auth.uid(); conv public.conversations%rowtype; heading text; recipient uuid;
begin
  if me is null then raise exception 'not authenticated'; end if;
  select * into conv from public.conversations c where c.id = p_conversation_id;
  if conv.id is null or not private.is_participant(p_conversation_id, me) then raise exception 'not a participant'; end if;
  -- Old messages stay readable after a friendship ends, but nothing new can be sent.
  if conv.kind = 'direct' and not private.can_contact(conv.user_a, conv.user_b) then raise exception 'conversation closed'; end if;
  if conv.kind = 'room' and not private.room_is_open(conv.id) then raise exception 'conversation closed'; end if;

  insert into public.messages(id, conversation_id, sender_id, body)
  values (p_id, p_conversation_id, me, trim(p_body))
  on conflict (id) do nothing;
  if not found then return; end if;

  update public.conversations c set last_message_at = clock_timestamp() where c.id = p_conversation_id;
  insert into public.conversation_reads(conversation_id, user_id) values (p_conversation_id, me)
  on conflict (conversation_id, user_id) do update set last_read_at = clock_timestamp();

  if conv.kind = 'group' then
    select g.name into heading from public.groups g where g.id = conv.group_id;
  elsif conv.kind = 'room' then
    heading := conv.title;
  else
    select coalesce(nullif(p.display_name, ''), p.username, 'Một người bạn') into heading from public.profiles p where p.id = me;
  end if;

  for recipient in select private.participants(p_conversation_id) loop
    perform private.emit(recipient, 'chat');
    if recipient <> me and not exists(
      select 1 from public.room_members m where m.conversation_id = p_conversation_id and m.user_id = recipient and m.muted) then
      -- One notification per conversation until it is read. It carries no message text.
      insert into public.notifications(user_id, category, title, body, action_path, dedupe_key)
      values (recipient, 'chat_message', 'Tin nhắn mới · ' || heading, '', '/chat/' || p_conversation_id::text,
        'chat:' || p_conversation_id::text || ':' || recipient::text)
      on conflict (dedupe_key) do nothing;
    end if;
  end loop;
end $$;

-- The caller's conversations, now with the rooms they joined. A function cannot change its columns
-- in place, so it is dropped and made again. An older app ignores the new columns.
drop function public.list_conversations();
create function public.list_conversations()
returns table(
  id uuid, kind text, title text, other_user_id uuid, group_id uuid,
  last_message_at timestamptz, last_message_body text, unread_count integer, recent_messages integer,
  closes_at timestamptz, closed boolean, source_kind text, source_id uuid, owner_id uuid, muted boolean
)
language sql stable security definer set search_path = '' as $$
  select
    c.id,
    c.kind,
    case when c.kind = 'group' then g.name when c.kind = 'room' then c.title else coalesce(nullif(p.display_name, ''), p.username, 'Người dùng') end,
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
      where m.conversation_id = c.id and m.created_at > now() - interval '14 days'),
    c.closes_at,
    c.kind = 'room' and (c.closed_at is not null or c.closes_at <= now()),
    c.source_kind,
    c.source_id,
    c.owner_id,
    coalesce((select rm.muted from public.room_members rm where rm.conversation_id = c.id and rm.user_id = auth.uid()), false)
  from public.conversations c
  left join public.groups g on g.id = c.group_id
  left join public.profiles p on c.kind = 'direct' and p.id = case when c.user_a = auth.uid() then c.user_b else c.user_a end
  where private.is_participant(c.id, auth.uid())
    and (c.kind <> 'direct' or not private.is_blocked_between(c.user_a, c.user_b))
    and (c.kind <> 'group' or g.archived_at is null)
  order by c.last_message_at desc nulls last, c.created_at desc
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.open_room(text, uuid, date, text)', 'public.join_room(uuid)', 'public.leave_room(uuid)', 'public.mute_room(uuid, boolean)',
    'public.remove_room_member(uuid, uuid)', 'public.close_room(uuid)', 'public.list_rooms(uuid, text, uuid, date)',
    'public.list_room_members(uuid)', 'public.list_conversations()'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

-- 5. A room follows the thing it belongs to.
-- A meetup: cancelled, its room closes at once; given a new end, the room closes a day after that; deleted, the room goes.
create function private.after_meetup_room_change() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    delete from public.conversations where kind = 'room' and source_kind = 'meetup' and source_id = old.id;
    return null;
  end if;
  update public.conversations set
    closed_at = case when new.status = 'canceled' then coalesce(closed_at, now()) else closed_at end,
    closes_at = case when new.end_at is not null then new.end_at + interval '24 hours' else closes_at end
  where kind = 'room' and source_kind = 'meetup' and source_id = new.id;
  return null;
end $$;
create trigger meetups_room after update of status, end_at or delete on public.meetups
for each row execute function private.after_meetup_room_change();

-- An event that happens once: moved, its room moves; deleted, its rooms go.
create function private.after_event_room_change() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    delete from public.conversations where kind = 'room' and source_kind = 'event' and source_id = old.id;
    return null;
  end if;
  if new.recurrence_rule is null then
    update public.conversations set closes_at = interval '24 hours' + case when new.event_kind = 'all_day'
      then new.all_day_end_exclusive::timestamp at time zone new.timezone else new.end_at end
    where kind = 'room' and source_kind = 'event' and source_id = new.id;
  end if;
  return null;
end $$;
create trigger calendar_events_room after update of end_at, all_day_end_exclusive or delete on public.calendar_events
for each row execute function private.after_event_room_change();

-- A mode: the same mode set again keeps its room to the new end; another mode, or none, closes it.
create function private.after_mode_room_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare who uuid := coalesce(new.user_id, old.user_id); room uuid;
begin
  for room in select c.id from public.conversations c where c.kind = 'room' and c.source_kind = 'mode' and c.source_id = who and c.closed_at is null and c.closes_at > now() loop
    if tg_op = 'UPDATE' and new.mode = old.mode then
      update public.conversations set closes_at = new.expires_at where id = room;
    else
      update public.conversations set closed_at = now() where id = room;
    end if;
    perform private.emit_room(room);
  end loop;
  return null;
end $$;
create trigger activity_modes_room after update or delete on public.activity_modes
for each row execute function private.after_mode_room_change();

-- 6. Seven days after a room closed, it is deleted with its messages. So is a room whose thing is gone.
create function private.purge_closed_rooms() returns void
language sql set search_path = '' as $$
  delete from public.conversations c
  where c.kind = 'room' and (
    coalesce(c.closed_at, c.closes_at) < now() - interval '7 days'
    or (c.source_kind = 'meetup' and not exists(select 1 from public.meetups m where m.id = c.source_id))
    or (c.source_kind = 'event' and not exists(select 1 from public.calendar_events e where e.id = c.source_id)));
$$;

do $$
begin
  perform cron.schedule('purge-closed-rooms', '7 * * * *', 'select private.purge_closed_rooms()');
exception when others then
  raise warning 'pg_cron is unavailable (%). Closed rooms then stay stored; they still take no message and are hidden from people who may not see them.', sqlerrm;
end $$;

-- Chat: replies, reactions, editing, unsending, "seen", typing, mute for every conversation, search.
--
-- An installed app can run an older build for days, so nothing an older build calls is taken away:
--   * send_message(uuid, uuid, text) stays. The new arguments go to a new function, post_message.
--   * list_messages and list_conversations are made again with more columns; an older build ignores them.
--   * A message that was unsent reaches an older build as the text "Tin nhắn đã thu hồi".

-- 1. A message can answer another, be changed, and be taken back.
alter table public.messages
  add column reply_to_id uuid references public.messages(id) on delete set null,
  add column edited_at timestamptz,
  -- Unsent: the text is erased and the row stays, so the thread keeps its place and its answers.
  add column deleted_at timestamptz;
alter table public.messages drop constraint messages_body_check;
alter table public.messages add constraint messages_body_check check (deleted_at is not null or length(trim(body)) between 1 and 4000);

-- One reaction per person per message.
create table public.message_reactions (
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  reaction text not null check (reaction in ('heart', 'laugh', 'wow', 'sad', 'angry', 'like')),
  created_at timestamptz not null default now(),
  primary key (message_id, user_id)
);

-- What one person set for one conversation. Until `muted_until` no message there is told to them;
-- 'infinity' means until they turn it back on.
create table public.conversation_settings (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  muted_until timestamptz,
  primary key (conversation_id, user_id)
);

alter table public.message_reactions enable row level security;
alter table public.conversation_settings enable row level security;
revoke all on public.message_reactions, public.conversation_settings from anon, authenticated;

-- A room had its own switch (migration 0037); it still counts.
create function private.is_muted(p_conversation_id uuid, p_user_id uuid) returns boolean
language sql stable set search_path = '' as $$
  select exists(select 1 from public.conversation_settings s where s.conversation_id = p_conversation_id and s.user_id = p_user_id and s.muted_until > now())
      or exists(select 1 from public.room_members m where m.conversation_id = p_conversation_id and m.user_id = p_user_id and m.muted)
$$;

-- What a message says in one line: in the list of conversations, in a quoted reply, and to an older build.
create function private.message_preview(m public.messages) returns text
language sql stable set search_path = '' as $$
  select case when m.deleted_at is not null then 'Tin nhắn đã thu hồi' else m.body end
$$;

-- Whether new things may happen in a conversation: a message, a change, a reaction. Friends who are
-- no longer friends keep their history and add nothing to it; a closed room takes nothing.
create function private.conversation_is_open(p_conversation_id uuid) returns boolean
language sql stable set search_path = '' as $$
  select exists(
    select 1 from public.conversations c
    where c.id = p_conversation_id
      and (c.kind <> 'direct' or private.can_contact(c.user_a, c.user_b))
      and (c.kind <> 'room' or private.room_is_open(c.id)))
$$;

-- 2. Writing a message. `send_message` as it stood in migration 0038, with the reply, and with the
-- mute of any conversation in place of the mute of a room.
create function private.write_message(p_id uuid, p_conversation_id uuid, p_body text, p_reply_to_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := (select auth.uid()); conv public.conversations%rowtype; heading text; recipient uuid;
begin
  if me is null then raise exception 'not authenticated'; end if;
  select * into conv from public.conversations c where c.id = p_conversation_id;
  if conv.id is null or not private.is_participant(p_conversation_id, me) then raise exception 'not a participant'; end if;
  if not private.conversation_is_open(p_conversation_id) then raise exception 'conversation closed'; end if;
  if p_reply_to_id is not null and not exists(select 1 from public.messages m where m.id = p_reply_to_id and m.conversation_id = p_conversation_id) then
    raise exception 'message not found';
  end if;

  insert into public.messages(id, conversation_id, sender_id, body, reply_to_id)
  values (p_id, p_conversation_id, me, trim(p_body), p_reply_to_id)
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
    if recipient <> me and not private.is_muted(p_conversation_id, recipient) then
      -- One notification per conversation until it is read; it carries no message text. One that was
      -- read in the inbox is removed first, so the message is told again.
      delete from public.notifications n
      where n.dedupe_key = 'chat:' || p_conversation_id::text || ':' || recipient::text and n.read_at is not null;
      insert into public.notifications(user_id, category, title, body, action_path, dedupe_key)
      values (recipient, 'chat_message', 'Tin nhắn mới · ' || heading, '', '/chat/' || p_conversation_id::text,
        'chat:' || p_conversation_id::text || ':' || recipient::text)
      on conflict (dedupe_key) do nothing;
    end if;
  end loop;
end $$;

create or replace function public.send_message(p_id uuid, p_conversation_id uuid, p_body text) returns void
language sql security definer set search_path = '' as $$
  select private.write_message(p_id, p_conversation_id, p_body, null)
$$;

create function public.post_message(p_id uuid, p_conversation_id uuid, p_body text, p_reply_to_id uuid default null) returns void
language sql security definer set search_path = '' as $$
  select private.write_message(p_id, p_conversation_id, p_body, p_reply_to_id)
$$;

create function private.emit_chat(p_conversation_id uuid) returns void
language sql set search_path = '' as $$
  select private.emit(person, 'chat') from private.participants(p_conversation_id) person;
$$;

-- 3. Changing one's own text, within 15 minutes.
create function public.edit_message(p_id uuid, p_body text) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := (select auth.uid()); msg public.messages%rowtype;
begin
  if me is null then raise exception 'not authenticated'; end if;
  select * into msg from public.messages m where m.id = p_id and m.sender_id = me;
  if msg.id is null or msg.deleted_at is not null or not private.is_participant(msg.conversation_id, me) then raise exception 'message not found'; end if;
  if not private.conversation_is_open(msg.conversation_id) then raise exception 'conversation closed'; end if;
  if msg.created_at < now() - interval '15 minutes' then raise exception 'too late to edit'; end if;
  if length(trim(coalesce(p_body, ''))) not between 1 and 4000 then raise exception 'invalid message'; end if;
  if trim(p_body) = msg.body then return; end if;
  update public.messages set body = trim(p_body), edited_at = now() where id = p_id;
  perform private.emit_chat(msg.conversation_id);
end $$;

-- 4. Taking a message back, for everyone: one's own at any time; in a group also its owner and
-- admins, in a room its owner. The text is erased; the row stays.
create function public.delete_message(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := (select auth.uid()); msg public.messages%rowtype; conv public.conversations%rowtype;
begin
  if me is null then raise exception 'not authenticated'; end if;
  select * into msg from public.messages m where m.id = p_id;
  if msg.id is null or not private.is_participant(msg.conversation_id, me) then raise exception 'message not found'; end if;
  select * into conv from public.conversations c where c.id = msg.conversation_id;
  if conv.kind = 'room' and not private.room_is_open(conv.id) then raise exception 'conversation closed'; end if;
  if msg.sender_id <> me
     and not (conv.kind = 'group' and exists(
       select 1 from public.group_memberships g where g.group_id = conv.group_id and g.user_id = me and g.role in ('owner', 'admin')))
     and not (conv.kind = 'room' and conv.owner_id = me) then
    raise exception 'message not found';
  end if;
  if msg.deleted_at is not null then return; end if;
  update public.messages set body = '', deleted_at = now(), edited_at = null where id = p_id;
  delete from public.message_reactions r where r.message_id = p_id;
  perform private.emit_chat(msg.conversation_id);
end $$;

-- 5. One reaction per person per message. Null takes it back.
create function public.react_to_message(p_id uuid, p_reaction text default null) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := (select auth.uid()); msg public.messages%rowtype;
begin
  if me is null then raise exception 'not authenticated'; end if;
  select * into msg from public.messages m where m.id = p_id;
  if msg.id is null or msg.deleted_at is not null or not private.is_participant(msg.conversation_id, me) then raise exception 'message not found'; end if;
  if not private.conversation_is_open(msg.conversation_id) then raise exception 'conversation closed'; end if;
  if p_reaction is not null and p_reaction not in ('heart', 'laugh', 'wow', 'sad', 'angry', 'like') then raise exception 'invalid reaction'; end if;
  if p_reaction is null then
    delete from public.message_reactions r where r.message_id = p_id and r.user_id = me;
  else
    insert into public.message_reactions(message_id, user_id, reaction) values (p_id, me, p_reaction)
    on conflict (message_id, user_id) do update set reaction = excluded.reaction, created_at = now();
  end if;
  perform private.emit_chat(msg.conversation_id);
end $$;

-- 6. Reading. A page of messages, newest first, each with what it answers, its reactions, and
-- whether it was changed or taken back.
drop function public.list_messages(uuid, timestamptz, integer);
create function public.list_messages(p_conversation_id uuid, p_before timestamptz default null, p_limit integer default 50)
returns table(
  id uuid, sender_id uuid, sender_name text, body text, created_at timestamptz,
  reply_to jsonb, reactions jsonb, my_reaction text, edited boolean, deleted boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not private.is_participant(p_conversation_id, auth.uid()) then raise exception 'not a participant'; end if;

  return query
  select m.id, m.sender_id, coalesce(nullif(p.display_name, ''), p.username, 'Người dùng'), private.message_preview(m), m.created_at,
    (select jsonb_build_object('id', q.id, 'sender_name', coalesce(nullif(qp.display_name, ''), qp.username, 'Người dùng'),
        'body', left(private.message_preview(q), 140), 'deleted', q.deleted_at is not null)
      from public.messages q join public.profiles qp on qp.id = q.sender_id where q.id = m.reply_to_id),
    coalesce((select jsonb_object_agg(x.reaction, x.total)
      from (select r.reaction, count(*) as total from public.message_reactions r where r.message_id = m.id group by r.reaction) x), '{}'::jsonb),
    (select r.reaction from public.message_reactions r where r.message_id = m.id and r.user_id = auth.uid()),
    m.edited_at is not null and m.deleted_at is null,
    m.deleted_at is not null
  from public.messages m
  join public.profiles p on p.id = m.sender_id
  where m.conversation_id = p_conversation_id and (p_before is null or m.created_at < p_before)
  order by m.created_at desc
  limit least(greatest(p_limit, 1), 100);
end $$;

-- How far everyone else has read, for "Đã xem" under a message.
create function public.list_conversation_reads(p_conversation_id uuid)
returns table(user_id uuid, display_name text, avatar_url text, last_read_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not private.is_participant(p_conversation_id, auth.uid()) then raise exception 'not a participant'; end if;
  return query
  select p.id, coalesce(nullif(p.display_name, ''), p.username, 'Người dùng'), p.avatar_url, r.last_read_at
  from private.participants(p_conversation_id) person(id)
  join public.profiles p on p.id = person.id
  left join public.conversation_reads r on r.conversation_id = p_conversation_id and r.user_id = p.id
  where p.id <> auth.uid();
end $$;

-- Text without Vietnamese tone and vowel marks, in lower case, so that "an toi" finds "Ăn tối", as
-- the search of the app does (src/kernel/text.ts). Both cases are in the table, because lower()
-- changes letters outside ASCII only where the database's locale knows them.
create function private.unmarked(p_text text) returns text
language sql immutable set search_path = '' as $$
  select lower(translate(normalize(p_text, NFC),
    'àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđÀÁẢÃẠĂẰẮẲẴẶÂẦẤẨẪẬÈÉẺẼẸÊỀẾỂỄỆÌÍỈĨỊÒÓỎÕỌÔỒỐỔỖỘƠỜỚỞỠỢÙÚỦŨỤƯỪỨỬỮỰỲÝỶỸỴĐ',
    'aaaaaaaaaaaaaaaaaeeeeeeeeeeeiiiiiooooooooooooooooouuuuuuuuuuuyyyyydaaaaaaaaaaaaaaaaaeeeeeeeeeeeiiiiiooooooooooooooooouuuuuuuuuuuyyyyyd'))
$$;

-- Text inside one conversation, newest first, whether or not it was typed with its marks. Messages
-- that were taken back are not found.
create function public.search_messages(p_conversation_id uuid, p_query text, p_limit integer default 30)
returns table(id uuid, sender_name text, body text, created_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
declare wanted text := private.unmarked(trim(coalesce(p_query, '')));
begin
  if auth.uid() is null or not private.is_participant(p_conversation_id, auth.uid()) then raise exception 'not a participant'; end if;
  if length(wanted) < 2 then return; end if;
  return query
  select m.id, coalesce(nullif(p.display_name, ''), p.username, 'Người dùng'), m.body, m.created_at
  from public.messages m join public.profiles p on p.id = m.sender_id
  where m.conversation_id = p_conversation_id and m.deleted_at is null
    and private.unmarked(m.body) like '%' || replace(replace(replace(wanted, '\', '\\'), '%', '\%'), '_', '\_') || '%'
  order by m.created_at desc
  limit least(greatest(coalesce(p_limit, 30), 1), 50);
end $$;

-- 7. Mute. `p_minutes` null turns notifications back on, 0 mutes until that is done, any other number mutes for that long.
create function public.set_conversation_mute(p_conversation_id uuid, p_minutes integer default null) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := (select auth.uid());
begin
  if me is null or not private.is_participant(p_conversation_id, me) then raise exception 'not a participant'; end if;
  if p_minutes is null then
    delete from public.conversation_settings s where s.conversation_id = p_conversation_id and s.user_id = me;
    update public.room_members m set muted = false where m.conversation_id = p_conversation_id and m.user_id = me;
  else
    insert into public.conversation_settings(conversation_id, user_id, muted_until)
    values (p_conversation_id, me, case when p_minutes <= 0 then 'infinity'::timestamptz else now() + make_interval(mins => least(p_minutes, 525600)) end)
    on conflict (conversation_id, user_id) do update set muted_until = excluded.muted_until;
  end if;
  perform private.emit(me, 'chat');
end $$;

-- The caller's conversations, as in migration 0037, with: the last message as one line (an unsent one
-- says so), whether notifications are off by either switch, and until when.
drop function public.list_conversations();
create function public.list_conversations()
returns table(
  id uuid, kind text, title text, other_user_id uuid, group_id uuid,
  last_message_at timestamptz, last_message_body text, unread_count integer, recent_messages integer,
  closes_at timestamptz, closed boolean, source_kind text, source_id uuid, owner_id uuid, muted boolean, muted_until timestamptz
)
language sql stable security definer set search_path = '' as $$
  select
    c.id,
    c.kind,
    case when c.kind = 'group' then g.name when c.kind = 'room' then c.title else coalesce(nullif(p.display_name, ''), p.username, 'Người dùng') end,
    p.id,
    c.group_id,
    c.last_message_at,
    (select private.message_preview(m) from public.messages m where m.conversation_id = c.id order by m.created_at desc limit 1),
    (select count(*)::integer from public.messages m
      where m.conversation_id = c.id and m.sender_id <> auth.uid() and m.deleted_at is null
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
    private.is_muted(c.id, auth.uid()),
    (select s.muted_until from public.conversation_settings s where s.conversation_id = c.id and s.user_id = auth.uid() and s.muted_until > now())
  from public.conversations c
  left join public.groups g on g.id = c.group_id
  left join public.profiles p on c.kind = 'direct' and p.id = case when c.user_a = auth.uid() then c.user_b else c.user_a end
  where private.is_participant(c.id, auth.uid())
    and (c.kind <> 'direct' or not private.is_blocked_between(c.user_a, c.user_b))
    and (c.kind <> 'group' or g.archived_at is null)
  order by c.last_message_at desc nulls last, c.created_at desc
$$;

-- 8. Typing. Nothing is stored: the people of a conversation tell each other over a realtime topic
-- of that conversation, "chat:<conversation id>", which only they may join. The policy runs as the
-- person who joins, who has no access to the `private` schema, so the question it asks is in `public`.
create function public.can_join_chat_topic(p_topic text) returns boolean
language sql stable security definer set search_path = '' as $$
  select case when p_topic ~ '^chat:[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then private.is_participant(substring(p_topic from 6)::uuid, (select auth.uid())) else false end
$$;

do $$
begin
  if to_regclass('realtime.messages') is not null then
    create policy "participants hear typing in their conversations" on realtime.messages
      for select to authenticated using (public.can_join_chat_topic((select realtime.topic())));
    create policy "participants say they are typing in their conversations" on realtime.messages
      for insert to authenticated with check (public.can_join_chat_topic((select realtime.topic())));
  end if;
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.send_message(uuid, uuid, text)', 'public.post_message(uuid, uuid, text, uuid)', 'public.edit_message(uuid, text)',
    'public.delete_message(uuid)', 'public.react_to_message(uuid, text)', 'public.list_messages(uuid, timestamptz, integer)',
    'public.list_conversation_reads(uuid)', 'public.search_messages(uuid, text, integer)', 'public.set_conversation_mute(uuid, integer)',
    'public.list_conversations()', 'public.can_join_chat_topic(text)'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

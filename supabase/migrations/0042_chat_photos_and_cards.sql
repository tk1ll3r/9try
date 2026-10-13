-- Chat: photos, and cards that open something inside the app.
--
-- A photo is a file in the private bucket `chat`, named '<conversation id>/<message id>/<n>.jpg'. The
-- people of the conversation can read it while its message names it: a message that is taken back
-- takes its photos with it at once, before the file itself is removed. A card is a path inside the
-- app with a title ("Ăn tối · 18:00"); whether the reader may open what it leads to is decided by
-- that screen, as for any other link.

-- 1. What a message can carry besides text.
alter table public.messages
  add column kind text not null default 'text' check (kind in ('text', 'photo', 'card')),
  -- [{ "path": …, "width": …, "height": … }], at most six.
  add column attachments jsonb,
  -- A plain path of the app: nothing in it can lead outside.
  add column ref_path text check (ref_path is null or (ref_path ~ '^/[A-Za-z0-9_/-]*$' and ref_path !~ '//' and length(ref_path) <= 200)),
  add column ref_title text check (ref_title is null or length(ref_title) <= 120);
alter table public.messages drop constraint messages_body_check;
alter table public.messages add constraint messages_body_check check (
  deleted_at is not null
  or length(trim(body)) between 1 and 4000
  or (body = '' and (attachments is not null or ref_path is not null)));

-- 2. The bucket and who may use it.
insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values ('chat', 'chat', false, 419430, array['image/jpeg'])
on conflict (id) do update set public = false, file_size_limit = 419430, allowed_mime_types = array['image/jpeg'];

-- Whether the caller takes part in the conversation a file belongs to. In `public` because a policy
-- runs as the caller; it answers about the caller only.
create function public.can_use_chat_file(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select case when split_part(p_name, '/', 1) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
    then private.is_participant(split_part(p_name, '/', 1)::uuid, (select auth.uid())) else false end
$$;

-- Whether the caller may read a file: they take part in its conversation, and a message there that
-- was not taken back names the file.
create function public.can_read_chat_file(p_name text) returns boolean
language sql stable security definer set search_path = '' as $$
  select case when p_name ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/'
    then private.is_participant(split_part(p_name, '/', 1)::uuid, (select auth.uid())) and exists(
      select 1 from public.messages m
      where m.id = split_part(p_name, '/', 2)::uuid and m.conversation_id = split_part(p_name, '/', 1)::uuid
        and m.attachments @> jsonb_build_array(jsonb_build_object('path', p_name)))
    else false end
$$;

create policy "chat: a participant adds a file to their conversation" on storage.objects for insert to authenticated
  with check (bucket_id = 'chat' and public.can_use_chat_file(name));
-- The one who added a file reads it either way: it is theirs before it is sent, and theirs to remove after.
create policy "chat: a participant reads the photos of the messages they can read" on storage.objects for select to authenticated
  using (bucket_id = 'chat' and (owner_id = (select auth.uid())::text or public.can_read_chat_file(name)));
create policy "chat: a person removes the files they added" on storage.objects for delete to authenticated
  using (bucket_id = 'chat' and owner_id = (select auth.uid())::text);

-- 3. One line for a message that has no text of its own.
create or replace function private.message_preview(m public.messages) returns text
language sql stable set search_path = '' as $$
  select case
    when m.deleted_at is not null then 'Tin nhắn đã thu hồi'
    when m.body <> '' then m.body
    when m.kind = 'photo' then 'Đã gửi ảnh'
    else coalesce(nullif(m.ref_title, ''), 'Đã chia sẻ một mục')
  end
$$;

-- 4. Writing a message, now with photos and a card. The files must already be in the bucket, under
-- this conversation and this message, put there by the sender.
drop function public.post_message(uuid, uuid, text, uuid);
drop function private.write_message(uuid, uuid, text, uuid);
create function private.write_message(
  p_id uuid, p_conversation_id uuid, p_body text, p_reply_to_id uuid, p_attachments jsonb, p_ref_path text, p_ref_title text
) returns void
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid()); conv public.conversations%rowtype; heading text; recipient uuid;
  text_body text := trim(coalesce(p_body, '')); files jsonb; card text := nullif(trim(coalesce(p_ref_path, '')), '');
begin
  if me is null then raise exception 'not authenticated'; end if;
  select * into conv from public.conversations c where c.id = p_conversation_id;
  if conv.id is null or not private.is_participant(p_conversation_id, me) then raise exception 'not a participant'; end if;
  if not private.conversation_is_open(p_conversation_id) then raise exception 'conversation closed'; end if;
  if p_reply_to_id is not null and not exists(select 1 from public.messages m where m.id = p_reply_to_id and m.conversation_id = p_conversation_id) then
    raise exception 'message not found';
  end if;

  if p_attachments is not null and jsonb_typeof(p_attachments) = 'array' and jsonb_array_length(p_attachments) > 0 then
    if jsonb_array_length(p_attachments) > 6
       or exists(
         select 1 from jsonb_array_elements(p_attachments) x
         where coalesce(x->>'path', '') not like p_conversation_id::text || '/' || p_id::text || '/%'
            or coalesce(x->>'width', '') !~ '^[1-9][0-9]{0,3}$' or coalesce(x->>'height', '') !~ '^[1-9][0-9]{0,3}$'
            or not exists(select 1 from storage.objects o where o.bucket_id = 'chat' and o.name = x->>'path' and o.owner_id = me::text))
       or (select count(*) <> count(distinct x->>'path') from jsonb_array_elements(p_attachments) x) then
      raise exception 'invalid attachment';
    end if;
    select jsonb_agg(jsonb_build_object('path', x->>'path', 'width', (x->>'width')::integer, 'height', (x->>'height')::integer)) into files
    from jsonb_array_elements(p_attachments) x;
  end if;
  if card is not null and (card !~ '^/[A-Za-z0-9_/-]*$' or card ~ '//' or length(card) > 200) then raise exception 'invalid card'; end if;
  if text_body = '' and files is null and card is null then raise exception 'invalid message'; end if;
  if length(text_body) > 4000 then raise exception 'invalid message'; end if;

  insert into public.messages(id, conversation_id, sender_id, body, reply_to_id, kind, attachments, ref_path, ref_title)
  values (p_id, p_conversation_id, me, text_body, p_reply_to_id,
    case when files is not null then 'photo' when card is not null then 'card' else 'text' end,
    files, card, case when card is not null then nullif(left(trim(coalesce(p_ref_title, '')), 120), '') end)
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
  select private.write_message(p_id, p_conversation_id, p_body, null, null, null, null)
$$;

create function public.post_message(
  p_id uuid, p_conversation_id uuid, p_body text default '', p_reply_to_id uuid default null,
  p_attachments jsonb default null, p_ref_path text default null, p_ref_title text default null
) returns void
language sql security definer set search_path = '' as $$
  select private.write_message(p_id, p_conversation_id, p_body, p_reply_to_id, p_attachments, p_ref_path, p_ref_title)
$$;

-- Only text is changed afterwards: a message with photos or a card is taken back and sent again.
create or replace function public.edit_message(p_id uuid, p_body text) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := (select auth.uid()); msg public.messages%rowtype;
begin
  if me is null then raise exception 'not authenticated'; end if;
  select * into msg from public.messages m where m.id = p_id and m.sender_id = me;
  if msg.id is null or msg.deleted_at is not null or msg.kind <> 'text' or not private.is_participant(msg.conversation_id, me) then raise exception 'message not found'; end if;
  if not private.conversation_is_open(msg.conversation_id) then raise exception 'conversation closed'; end if;
  if msg.created_at < now() - interval '15 minutes' then raise exception 'too late to edit'; end if;
  if length(trim(coalesce(p_body, ''))) not between 1 and 4000 then raise exception 'invalid message'; end if;
  if trim(p_body) = msg.body then return; end if;
  update public.messages set body = trim(p_body), edited_at = now() where id = p_id;
  perform private.emit_chat(msg.conversation_id);
end $$;

-- Taking a message back also lets go of its photos and its card. The files are removed by whoever
-- added them, at once, and by the worker within the hour.
create or replace function public.delete_message(p_id uuid) returns void
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
  update public.messages set body = '', deleted_at = now(), edited_at = null, attachments = null, ref_path = null, ref_title = null where id = p_id;
  delete from public.message_reactions r where r.message_id = p_id;
  perform private.emit_chat(msg.conversation_id);
end $$;

-- A page of messages, as in migration 0041, with what each carries.
drop function public.list_messages(uuid, timestamptz, integer);
create function public.list_messages(p_conversation_id uuid, p_before timestamptz default null, p_limit integer default 50)
returns table(
  id uuid, sender_id uuid, sender_name text, body text, created_at timestamptz,
  reply_to jsonb, reactions jsonb, my_reaction text, edited boolean, deleted boolean,
  kind text, attachments jsonb, ref_path text, ref_title text, has_text boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not private.is_participant(p_conversation_id, auth.uid()) then raise exception 'not a participant'; end if;

  return query
  select m.id, m.sender_id, coalesce(nullif(p.display_name, ''), p.username, 'Người dùng'),
    -- To a build that knows only text, a photo or a card reads as its one line. `has_text` tells a
    -- build that draws the photo or the card whether `body` is the sender's own words.
    private.message_preview(m), m.created_at,
    (select jsonb_build_object('id', q.id, 'sender_name', coalesce(nullif(qp.display_name, ''), qp.username, 'Người dùng'),
        'body', left(private.message_preview(q), 140), 'deleted', q.deleted_at is not null)
      from public.messages q join public.profiles qp on qp.id = q.sender_id where q.id = m.reply_to_id),
    coalesce((select jsonb_object_agg(x.reaction, x.total)
      from (select r.reaction, count(*) as total from public.message_reactions r where r.message_id = m.id group by r.reaction) x), '{}'::jsonb),
    (select r.reaction from public.message_reactions r where r.message_id = m.id and r.user_id = auth.uid()),
    m.edited_at is not null and m.deleted_at is null,
    m.deleted_at is not null,
    m.kind, m.attachments, m.ref_path, m.ref_title, m.deleted_at is null and m.body <> ''
  from public.messages m
  join public.profiles p on p.id = m.sender_id
  where m.conversation_id = p_conversation_id and (p_before is null or m.created_at < p_before)
  order by m.created_at desc
  limit least(greatest(p_limit, 1), 100);
end $$;

-- 5. What the worker removes now also covers this bucket: a file whose message is gone, was taken
-- back, or was never sent.
create or replace function public.orphan_media_files(p_limit integer default 100) returns table(bucket text, name text)
language sql stable security definer set search_path = '' as $$
  select o.bucket_id::text, o.name::text from storage.objects o
  where o.created_at < now() - interval '1 hour' and (
    (o.bucket_id = 'moments' and not exists(select 1 from public.moments m where m.path = o.name))
    or (o.bucket_id = 'chat' and not exists(
      select 1 from public.messages m
      where m.attachments is not null
        and m.id = case when split_part(o.name, '/', 2) ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then split_part(o.name, '/', 2)::uuid end
        and m.attachments @> jsonb_build_array(jsonb_build_object('path', o.name)))))
  order by o.created_at
  limit least(greatest(coalesce(p_limit, 100), 1), 1000)
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.can_use_chat_file(text)', 'public.can_read_chat_file(text)', 'public.send_message(uuid, uuid, text)',
    'public.post_message(uuid, uuid, text, uuid, jsonb, text, text)', 'public.list_messages(uuid, timestamptz, integer)'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;
revoke execute on function public.orphan_media_files(integer) from public, anon, authenticated;
grant execute on function public.orphan_media_files(integer) to service_role;

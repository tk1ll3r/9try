-- A message is told again after its conversation's notification was read in the inbox.
--
-- A conversation has one notification while it is unread (migration 0020), and that row was removed
-- only when the conversation itself was opened. Someone who marked it read in the inbox, without
-- opening the conversation, kept the row. Every later message found it there and told nothing: no
-- entry in the inbox and no push, until the conversation was opened. Found by sending real pushes
-- from a local stack (docs/implementation-progress.md, 2026-10-09).
--
-- `send_message` is as it stood in migration 0037, with one statement added: a notification that
-- was read is removed before the new one is written.
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
      -- One notification per conversation while it is unread. It carries no message text. One that
      -- was read in the inbox is replaced, so that this message is told, and pushed, as news.
      delete from public.notifications n
      where n.dedupe_key = 'chat:' || p_conversation_id::text || ':' || recipient::text and n.read_at is not null;
      insert into public.notifications(user_id, category, title, body, action_path, dedupe_key)
      values (recipient, 'chat_message', 'Tin nhắn mới · ' || heading, '', '/chat/' || p_conversation_id::text,
        'chat:' || p_conversation_id::text || ':' || recipient::text)
      on conflict (dedupe_key) do nothing;
    end if;
  end loop;
end $$;

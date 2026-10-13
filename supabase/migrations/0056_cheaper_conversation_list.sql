-- The chat badge asks for every conversation on every screen. Counting a conversation's messages
-- twice, including its whole history, was most of that read. One pass now keeps only the messages
-- after the older of "last read" and 14 days, which is exactly what the two counts use.
-- messages_by_conversation (conversation_id, created_at desc) serves that range.
create or replace function public.list_conversations()
returns table(
  id uuid, kind text, title text, other_user_id uuid, group_id uuid,
  last_message_at timestamptz, last_message_body text, unread_count integer, recent_messages integer,
  closes_at timestamptz, closed boolean, source_kind text, source_id uuid, owner_id uuid, muted boolean, muted_until timestamptz
)
language sql stable security definer set search_path = '' as $$
  with me as (select (select auth.uid()) as uid)
  select
    c.id,
    c.kind,
    case when c.kind = 'group' then g.name when c.kind = 'room' then c.title else coalesce(nullif(p.display_name, ''), p.username, 'Người dùng') end,
    p.id,
    c.group_id,
    c.last_message_at,
    last_msg.preview,
    coalesce(stats.unread_count, 0),
    coalesce(stats.recent_messages, 0),
    c.closes_at,
    c.kind = 'room' and (c.closed_at is not null or c.closes_at <= now()),
    c.source_kind,
    c.source_id,
    c.owner_id,
    private.is_muted(c.id, me.uid),
    (select s.muted_until from public.conversation_settings s where s.conversation_id = c.id and s.user_id = me.uid and s.muted_until > now())
  from public.conversations c
  cross join me
  left join public.groups g on g.id = c.group_id
  left join public.profiles p on c.kind = 'direct' and p.id = case when c.user_a = me.uid then c.user_b else c.user_a end
  left join public.conversation_reads r on r.conversation_id = c.id and r.user_id = me.uid
  left join lateral (
    select private.message_preview(m) as preview
    from public.messages m
    where m.conversation_id = c.id
    order by m.created_at desc
    limit 1
  ) last_msg on true
  left join lateral (
    select
      count(*) filter (
        where m.sender_id <> me.uid
          and m.deleted_at is null
          and m.created_at > coalesce(r.last_read_at, '-infinity'::timestamptz)
      )::integer as unread_count,
      count(*) filter (where m.created_at > now() - interval '14 days')::integer as recent_messages
    from public.messages m
    where m.conversation_id = c.id
      and m.created_at > least(
        coalesce(r.last_read_at, '-infinity'::timestamptz),
        now() - interval '14 days'
      )
  ) stats on true
  where private.is_participant(c.id, me.uid)
    and (c.kind <> 'direct' or not private.is_blocked_between(c.user_a, c.user_b))
    and (c.kind <> 'group' or g.archived_at is null)
  order by c.last_message_at desc nulls last, c.created_at desc
$$;

-- The bell counts unread rows on every screen. This index is only those rows.
create index if not exists notifications_unread_by_user
  on public.notifications (user_id)
  where read_at is null;

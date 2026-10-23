-- A relationship streak advances on local calendar days with at least one direct message.
-- Message history before the relationship was accepted does not count.
drop function public.list_my_friend_relationships();
create function public.list_my_friend_relationships()
returns table(
  friend_id uuid, friend_name text, friend_avatar_url text, relationship text, created_at timestamptz,
  current_streak integer, last_message_at timestamptz
)
language plpgsql stable security definer set search_path = '' as $$
declare me uuid := (select auth.uid());
begin
  if me is null then raise exception 'not authenticated'; end if;
  return query
    with my_relationships as (
      select
        case when relationship.user_a_id = me then relationship.user_b_id else relationship.user_a_id end as friend_id,
        coalesce(nullif(profile.display_name, ''), profile.username, 'Người dùng') as friend_name,
        profile.avatar_url as friend_avatar_url,
        relationship.relationship,
        relationship.created_at
      from public.friend_relationships relationship
      join public.profiles profile
        on profile.id = case when relationship.user_a_id = me then relationship.user_b_id else relationship.user_a_id end
      where me in (relationship.user_a_id, relationship.user_b_id)
        and private.can_contact(me, case when relationship.user_a_id = me then relationship.user_b_id else relationship.user_a_id end)
    ),
    daily_messages as (
      select
        relationship.friend_id,
        pg_catalog.timezone('Asia/Ho_Chi_Minh', message.created_at)::date as message_day,
        max(message.created_at) as last_message_at
      from my_relationships relationship
      join public.conversations conversation
        on conversation.kind = 'direct'
        and conversation.user_a = least(me, relationship.friend_id)
        and conversation.user_b = greatest(me, relationship.friend_id)
      join public.messages message
        on message.conversation_id = conversation.id
        and message.sender_id in (me, relationship.friend_id)
        and message.deleted_at is null
        and message.created_at >= relationship.created_at
      group by relationship.friend_id, pg_catalog.timezone('Asia/Ho_Chi_Minh', message.created_at)::date
    ),
    ranked_days as (
      select
        daily.friend_id, daily.message_day,
        first_value(daily.message_day) over (partition by daily.friend_id order by daily.message_day desc) as latest_day,
        row_number() over (partition by daily.friend_id order by daily.message_day desc) as day_rank,
        max(daily.last_message_at) over (partition by daily.friend_id) as last_message_at
      from daily_messages daily
    ),
    streaks as (
      select
        ranked.friend_id,
        case
          when max(ranked.latest_day) >= pg_catalog.timezone('Asia/Ho_Chi_Minh', now())::date - 1
          then count(*) filter (where ranked.message_day = ranked.latest_day - (ranked.day_rank - 1)::integer)
          else 0
        end::integer as current_streak,
        max(ranked.last_message_at) as last_message_at
      from ranked_days ranked
      group by ranked.friend_id
    )
    select
      relationship.friend_id, relationship.friend_name, relationship.friend_avatar_url,
      relationship.relationship, relationship.created_at,
      coalesce(streak.current_streak, 0), streak.last_message_at
    from my_relationships relationship
    left join streaks streak on streak.friend_id = relationship.friend_id
    order by relationship.created_at desc;
end $$;

revoke all on function public.list_my_friend_relationships() from public, anon;
grant execute on function public.list_my_friend_relationships() to authenticated;

-- Keep both people’s relationship screen and chat header current after a direct message.
drop trigger if exists messages_relationship_streak_change on public.messages;
drop function if exists private.emit_relationship_streak_change();
create function private.emit_relationship_streak_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  participant_a uuid;
  participant_b uuid;
begin
  select conversation.user_a, conversation.user_b into participant_a, participant_b
  from public.conversations conversation
  join public.friend_relationships relationship
    on relationship.user_a_id = conversation.user_a and relationship.user_b_id = conversation.user_b
  where conversation.id = new.conversation_id
    and conversation.kind = 'direct'
    and private.can_contact(conversation.user_a, conversation.user_b);

  if participant_a is not null then
    perform private.emit(participant_a, 'relationship-streaks');
    perform private.emit(participant_b, 'relationship-streaks');
  end if;
  return new;
end $$;
revoke all on function private.emit_relationship_streak_change() from public, anon, authenticated;

create trigger messages_relationship_streak_change
after insert on public.messages
for each row execute function private.emit_relationship_streak_change();

-- When someone sets, changes or clears their mode, tell them and the friends who may see it,
-- so that the Mode screen changes at once instead of on its timer. The event carries no data:
-- each client reloads what row level security lets it read.
create function private.after_activity_mode_change() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  who uuid := coalesce(new.user_id, old.user_id);
begin
  perform private.emit(who, 'presence');
  perform private.emit(friends.friend_id, 'presence')
  from (
    select case when f.requester_id = who then f.addressee_id else f.requester_id end as friend_id
    from public.friendships f
    where f.status = 'accepted' and who in (f.requester_id, f.addressee_id)
  ) friends
  where not private.is_blocked_between(who, friends.friend_id);
  return null;
end $$;

create trigger activity_modes_after_change after insert or update or delete on public.activity_modes
for each row execute function private.after_activity_mode_change();

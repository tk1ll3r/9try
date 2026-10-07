-- A personal link: whoever opens it while signed in becomes a friend of its owner.
-- One live link per person, valid for 7 days. Making a new link ends the old one.
create table public.friend_invites(
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  token_hash text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
-- No policies: the table is only reached through the two functions below.
alter table public.friend_invites enable row level security;

create or replace function public.create_friend_invite() returns table(token text, expires_at timestamptz)
language plpgsql security definer set search_path = '' as $$
declare raw_token text; expiry timestamptz := now() + interval '7 days';
begin
  if auth.uid() is null then raise exception 'not authenticated'; end if;
  delete from public.friend_invites i where i.owner_id = auth.uid();
  raw_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  insert into public.friend_invites(owner_id, token_hash, expires_at)
  values (auth.uid(), encode(sha256(convert_to(raw_token, 'UTF8')), 'hex'), expiry);
  return query select raw_token, expiry;
end $$;

create or replace function public.claim_friend_invite(p_token text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare inviter uuid; me uuid := auth.uid();
begin
  if me is null then raise exception 'not authenticated'; end if;

  select i.owner_id into inviter
  from public.friend_invites i
  where i.token_hash = encode(sha256(convert_to(trim(p_token), 'UTF8')), 'hex') and i.expires_at > now();
  if inviter is null then raise exception 'invite not found'; end if;
  if inviter = me then raise exception 'own invite'; end if;
  if private.is_blocked_between(me, inviter) then raise exception 'link unavailable'; end if;

  if not private.are_friends(me, inviter) then
    delete from public.friendships f
    where (f.requester_id = me and f.addressee_id = inviter) or (f.requester_id = inviter and f.addressee_id = me);
    insert into public.friendships(requester_id, addressee_id, status, responded_at)
    values (inviter, me, 'accepted', now());
    insert into public.notifications(user_id, category, title, body, action_path)
    values (inviter, 'friend_request', 'Có bạn mới qua liên kết', 'Một người vừa dùng liên kết kết bạn của bạn.', '/me/friends');
  end if;

  return inviter;
end $$;

revoke execute on function public.create_friend_invite() from public, anon;
revoke execute on function public.claim_friend_invite(text) from public, anon;
grant execute on function public.create_friend_invite() to authenticated;
grant execute on function public.claim_friend_invite(text) to authenticated;

-- Both people's friend lists reload when anything about their connection changes.
create or replace function private.after_friendship_change() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform private.emit(coalesce(new.requester_id, old.requester_id), 'friends');
  perform private.emit(coalesce(new.addressee_id, old.addressee_id), 'friends');
  return null;
end $$;

drop trigger if exists friendships_after_change on public.friendships;
create trigger friendships_after_change after insert or update or delete on public.friendships
for each row execute function private.after_friendship_change();

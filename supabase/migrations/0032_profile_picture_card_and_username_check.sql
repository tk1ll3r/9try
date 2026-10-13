-- A profile gets a picture, friends can open a person's card, and the profile form can ask whether a
-- username is free before saving.
--
-- The picture is stored inside the row, as a small JPEG that the app cut to a square on the device.
-- It then travels only through the same rules as the name: a friend sees it, a stranger does not, and
-- unfriending ends it at once. A web address is refused on purpose: a picture loaded from someone's
-- own server would tell that server who looked at the profile, and when.

-- A value that the app never wrote cannot be shown any more. Nothing in the app ever set this column.
update public.profiles set avatar_url = null
where avatar_url is not null
  and not (avatar_url ~ '^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$' and length(avatar_url) <= 60000);

alter table public.profiles add constraint profiles_avatar_is_a_small_inline_picture
  check (avatar_url is null or (avatar_url ~ '^data:image/(jpeg|png|webp);base64,[A-Za-z0-9+/]+=*$' and length(avatar_url) <= 60000));

-- The limits the form already has. "not valid" leaves a row that was saved earlier as it is and
-- applies to every change from now on.
alter table public.profiles add constraint profiles_text_lengths
  check (length(display_name) <= 80 and length(coalesce(bio, '')) <= 500) not valid;
alter table public.profiles add constraint profiles_visibility_values
  check (coalesce(profile_visibility->>'bio', 'friends') in ('private', 'friends')
     and coalesce(profile_visibility->>'birthday', 'private') in ('private', 'friends')) not valid;

-- Whether nobody else has this username. The profile form asks while the person types.
create function public.username_available(p_username text) returns boolean
language sql stable security definer set search_path = '' as $$
  select (select auth.uid()) is not null and not exists(
    select 1 from public.profiles p
    where p.username is not null and lower(p.username) = lower(trim(p_username)) and p.id <> (select auth.uid()))
$$;

-- A person's card: what their friends may see of the profile. The introduction is shown to friends
-- unless its owner made it private; the birthday only when its owner chose to show it, and then
-- without the year. A stranger, an ex-friend and a blocked person get no row.
create function public.get_profile_card(p_user_id uuid)
returns table(user_id uuid, display_name text, username text, avatar_url text, bio text, birthday text)
language sql stable security definer set search_path = '' as $$
  select p.id, p.display_name, p.username, p.avatar_url,
    case when p.id = (select auth.uid()) or coalesce(p.profile_visibility->>'bio', 'friends') = 'friends' then nullif(p.bio, '') end,
    case when p.id = (select auth.uid()) or p.profile_visibility->>'birthday' = 'friends' then to_char(p.birthday, 'MM-DD') end
  from public.profiles p
  where p.id = p_user_id
    and (p.id = (select auth.uid()) or private.can_contact((select auth.uid()), p.id))
$$;

revoke execute on function public.username_available(text) from public, anon;
revoke execute on function public.get_profile_card(uuid) from public, anon;
grant execute on function public.username_available(text) to authenticated;
grant execute on function public.get_profile_card(uuid) to authenticated;

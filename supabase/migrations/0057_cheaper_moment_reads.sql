-- list_moments asked, for every live photo, who may see it, whether this person looked, their
-- reaction, and for their own photos a fresh count of views and reactions. Those counts are now
-- one join each. The answer is the same: own photos, friends' photos still shared, selected
-- viewers, seen, one reaction, and the owner's tallies.
create or replace function public.list_moments()
returns table(
  id uuid, owner_id uuid, owner_name text, owner_avatar_url text, path text, mode text,
  mode_label text, mode_icon text, mode_color text, caption text, width integer, height integer,
  created_at timestamptz, expires_at timestamptz, audience text, seen boolean, my_reaction text,
  views integer, reactions jsonb
)
language sql stable security definer set search_path = '' as $$
  with me as (select (select auth.uid()) as uid)
  select
    m.id,
    m.owner_id,
    coalesce(nullif(p.display_name, ''), p.username, 'Người dùng'),
    p.avatar_url,
    m.path,
    m.mode,
    m.mode_label,
    m.mode_icon,
    m.mode_color,
    m.caption,
    m.width,
    m.height,
    m.created_at,
    m.expires_at,
    m.audience,
    m.owner_id = me.uid or viewed.moment_id is not null,
    mine_reaction.reaction,
    case when m.owner_id = me.uid then coalesce(view_counts.total, 0) end,
    case when m.owner_id = me.uid then coalesce(reaction_counts.reactions, '{}'::jsonb) end
  from public.moments m
  cross join me
  join public.profiles p on p.id = m.owner_id
  left join public.moment_views viewed on viewed.moment_id = m.id and viewed.user_id = me.uid
  left join public.moment_reactions mine_reaction on mine_reaction.moment_id = m.id and mine_reaction.user_id = me.uid
  left join lateral (
    select count(*)::integer as total from public.moment_views v where v.moment_id = m.id
  ) view_counts on m.owner_id = me.uid
  left join lateral (
    select coalesce(jsonb_object_agg(x.reaction, x.total), '{}'::jsonb) as reactions
    from (
      select r.reaction, count(*) as total
      from public.moment_reactions r
      where r.moment_id = m.id
      group by r.reaction
    ) x
  ) reaction_counts on m.owner_id = me.uid
  where m.expires_at > now()
    and me.uid is not null
    and (
      m.owner_id = me.uid
      or (
        private.can_contact(m.owner_id, me.uid)
        and (
          m.audience = 'friends'
          or exists(select 1 from public.moment_viewers v where v.moment_id = m.id and v.user_id = me.uid)
        )
      )
    )
  order by m.created_at desc
$$;

-- The badge used to count a person's streak twice: once to decide and once to return it.
create or replace function public.list_moment_streak_badges()
returns table(user_id uuid, streak_days integer)
language plpgsql stable security definer set search_path = '' as $$
declare me uuid := (select auth.uid());
begin
  if me is null then raise exception 'not authenticated'; end if;
  return query
  with audience as (
    select me as user_id
    union
    select case when f.requester_id = me then f.addressee_id else f.requester_id end
    from public.friendships f
    where f.status = 'accepted' and me in (f.requester_id, f.addressee_id)
      and private.can_contact(me, case when f.requester_id = me then f.addressee_id else f.requester_id end)
  ), scored as (
    select audience.user_id, private.moment_streak_days(audience.user_id) as streak_days
    from audience
  )
  select scored.user_id, scored.streak_days from scored where scored.streak_days >= 3;
end $$;

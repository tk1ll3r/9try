-- Expand the custom mode icon catalog. The app and these checks share the same stable icon keys.
alter table public.custom_activity_modes drop constraint if exists custom_activity_modes_icon_check;
alter table public.custom_activity_modes add constraint custom_activity_modes_icon_check check (
  icon in ('sparkles','coffee','book','briefcase','game','smile','camera','food','heart','star','music','leaf','sun','moon','paw','bike','car','plane','home','laptop','palette','pizza','gift','dumbbell')
);

alter table public.moments drop constraint if exists moments_mode_presentation_check;
alter table public.moments add constraint moments_mode_presentation_check check (
  (mode_label is null and mode_icon is null and mode_color is null)
  or (mode_label is not null and mode_icon is not null and mode_color is not null
      and length(trim(mode_label)) between 1 and 28
      and mode_icon in ('sparkles','coffee','book','briefcase','game','smile','camera','food','heart','star','music','leaf','sun','moon','paw','bike','car','plane','home','laptop','palette','pizza','gift','dumbbell')
      and mode_color in ('#22c55e','#3b82f6','#8b5cf6','#a16207','#ec4899','#ef4444','#06b6d4','#d97706'))
);

create or replace function public.create_my_custom_activity_mode(p_id uuid, p_label text, p_icon text, p_color text)
returns table(mode text, label text, icon text, color text)
language plpgsql security definer set search_path = '' as $$
declare me uuid := (select auth.uid()); clean_label text := left(trim(coalesce(p_label, '')), 28); existing public.custom_activity_modes%rowtype;
begin
  if me is null then raise exception 'not authenticated'; end if;
  if p_id is null or length(clean_label) < 1
     or p_icon is null or p_icon not in ('sparkles','coffee','book','briefcase','game','smile','camera','food','heart','star','music','leaf','sun','moon','paw','bike','car','plane','home','laptop','palette','pizza','gift','dumbbell')
     or p_color not in ('#22c55e','#3b82f6','#8b5cf6','#a16207','#ec4899','#ef4444','#06b6d4','#d97706') then
    raise exception 'invalid custom mode';
  end if;

  perform pg_advisory_xact_lock(hashtextextended(me::text, 1));
  select * into existing from public.custom_activity_modes c where c.id = p_id;
  if existing.id is not null then
    if existing.user_id <> me or existing.label <> clean_label or existing.icon <> p_icon or existing.color <> p_color then
      raise exception 'custom mode id already used';
    end if;
    return query select existing.mode, existing.label, existing.icon, existing.color;
    return;
  end if;

  select * into existing from public.custom_activity_modes c where c.user_id = me and lower(c.label) = lower(clean_label);
  if existing.id is not null then
    if existing.label <> clean_label or existing.icon <> p_icon or existing.color <> p_color then raise exception 'custom mode name already exists'; end if;
    return query select existing.mode, existing.label, existing.icon, existing.color;
    return;
  end if;

  insert into public.custom_activity_modes(id, user_id, label, icon, color)
  values (p_id, me, clean_label, p_icon, p_color);
  return query select c.mode, c.label, c.icon, c.color from public.custom_activity_modes c where c.id = p_id and c.user_id = me;
end $$;
revoke all on function public.create_my_custom_activity_mode(uuid,text,text,text) from public, anon;
grant execute on function public.create_my_custom_activity_mode(uuid,text,text,text) to authenticated;

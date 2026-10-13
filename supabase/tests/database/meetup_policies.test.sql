-- Disposable local database only; all fixtures roll back.
-- a = d01 organizes, b = d02 is invited, c = d03 is in the meetup's group but not invited, d = d04 is a stranger.
begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

insert into auth.users(id, instance_id, aud, role, email)
values
  ('00000000-0000-4000-8000-000000000d01','00000000-0000-0000-0000-000000000000','authenticated','authenticated','meet-a@example.invalid'),
  ('00000000-0000-4000-8000-000000000d02','00000000-0000-0000-0000-000000000000','authenticated','authenticated','meet-b@example.invalid'),
  ('00000000-0000-4000-8000-000000000d03','00000000-0000-0000-0000-000000000000','authenticated','authenticated','meet-c@example.invalid'),
  ('00000000-0000-4000-8000-000000000d04','00000000-0000-0000-0000-000000000000','authenticated','authenticated','meet-d@example.invalid');
insert into public.groups(id, owner_id, name, member_count) values ('00000000-0000-4000-8000-000000000da1','00000000-0000-4000-8000-000000000d01','Nhóm',2);
insert into public.group_memberships(group_id, user_id, role) values
  ('00000000-0000-4000-8000-000000000da1','00000000-0000-4000-8000-000000000d01','owner'),
  ('00000000-0000-4000-8000-000000000da1','00000000-0000-4000-8000-000000000d03','member');
insert into public.meetups(id, group_id, organizer_id, title, status, timezone)
values ('00000000-0000-4000-8000-000000000db1','00000000-0000-4000-8000-000000000da1','00000000-0000-4000-8000-000000000d01','Ăn tối','proposed','UTC');
insert into public.meetup_invitees(meetup_id, user_id, rsvp_status) values
  ('00000000-0000-4000-8000-000000000db1','00000000-0000-4000-8000-000000000d01','going'),
  ('00000000-0000-4000-8000-000000000db1','00000000-0000-4000-8000-000000000d02','pending');
insert into public.meetup_time_options(id, meetup_id, starts_at, ends_at)
values ('00000000-0000-4000-8000-000000000dc1','00000000-0000-4000-8000-000000000db1', now() + interval '1 day', now() + interval '1 day 2 hours');
insert into public.meetup_votes(option_id, user_id, available) values ('00000000-0000-4000-8000-000000000dc1','00000000-0000-4000-8000-000000000d02', true);
insert into public.meetup_comments(meetup_id, author_id, body) values ('00000000-0000-4000-8000-000000000db1','00000000-0000-4000-8000-000000000d01','Mấy giờ?');

-- Every table of the app can be read by a signed-in person without an error. A table that is closed
-- to them answers "permission denied", which is an answer; anything else is a broken policy.
create function pg_temp.broken_reads() returns text language plpgsql as $$
declare t text; found text := '';
begin
  for t in select tablename from pg_tables where schemaname = 'public' order by tablename loop
    begin
      execute format('select count(*) from public.%I', t);
    exception
      when insufficient_privilege then null;
      when others then found := found || t || ': ' || sqlerrm || '; ';
    end;
  end loop;
  return found;
end $$;

-- The organizer: the meetup, both invitations, the option, the vote, the comment.
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000d01',true);
select is(pg_temp.broken_reads(), '', 'no table fails when a signed-in person reads it');
select is((select count(*) from public.meetups), 1::bigint, 'the organizer reads the meetup');
select is((select count(*) from public.meetup_invitees), 2::bigint, 'and everyone who is invited');
select is((select count(*) from public.meetup_time_options) + (select count(*) from public.meetup_votes) + (select count(*) from public.meetup_comments), 3::bigint, 'and its options, votes and comments');

-- A guest: the meetup and their own invitation, as the app's list asks for them.
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000d02',true);
select is((select m.title || ' ' || i.rsvp_status from public.meetup_invitees i join public.meetups m on m.id = i.meetup_id where i.user_id = '00000000-0000-4000-8000-000000000d02'), 'Ăn tối pending', 'a guest reads their invitation with the meetup');
select is((select count(*) from public.meetup_invitees), 1::bigint, 'a guest does not read the other invitations from the table');
select is((select count(*) from public.meetup_time_options) + (select count(*) from public.meetup_votes) + (select count(*) from public.meetup_comments), 3::bigint, 'a guest reads the options, votes and comments');
select is(public.is_meetup_invitee('00000000-0000-4000-8000-000000000db1'), true, 'the guest is invited');
select is(public.is_meetup_organizer('00000000-0000-4000-8000-000000000db1'), false, 'and is not the organizer');

-- A member of the meetup's group who is not invited: the meetup itself, nothing inside it.
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000d03',true);
select is((select count(*) from public.meetups), 1::bigint, 'a member of the group reads the meetup');
select is((select count(*) from public.meetup_invitees) + (select count(*) from public.meetup_time_options) + (select count(*) from public.meetup_comments), 0::bigint, 'but not who is invited, nor the options and comments');

-- A stranger: nothing.
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000d04',true);
select is((select count(*) from public.meetups) + (select count(*) from public.meetup_invitees) + (select count(*) from public.meetup_time_options) + (select count(*) from public.meetup_votes) + (select count(*) from public.meetup_comments), 0::bigint, 'a stranger reads nothing');
select is(public.is_meetup_invitee('00000000-0000-4000-8000-000000000db1'), false, 'and learns only that they are not invited');
reset role;
set local role anon;
select throws_ok($$select public.is_meetup_invitee('00000000-0000-4000-8000-000000000db1')$$, '42501', null, 'an anonymous visitor cannot ask');
reset role;
select * from finish();
rollback;

-- Disposable local database only; all fixtures roll back.
begin;
create extension if not exists pgtap with schema extensions;
select plan(18);

insert into auth.users(id, instance_id, aud, role, email)
select ('00000000-0000-4000-8000-00000000010' || n)::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'custom-mode-' || n || '@example.invalid'
from generate_series(1, 3) n;
insert into public.friendships(requester_id, addressee_id, status)
values ('00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000102', 'accepted');

set local role authenticated;
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000101', true);
select lives_ok($$select * from public.create_my_custom_activity_mode('00000000-0000-4000-8000-00000000c101', 'Đi dạo', 'camera', '#22c55e')$$, 'the owner saves a custom mode');
select lives_ok($$select * from public.create_my_custom_activity_mode('00000000-0000-4000-8000-00000000c106', 'Âm nhạc', 'music', '#d97706')$$, 'the owner can save a newly added custom mode icon');
select is((select icon from public.custom_activity_modes where user_id = '00000000-0000-4000-8000-000000000101' and label = 'Âm nhạc'), 'music', 'the new custom mode icon is stored');
select lives_ok($$select * from public.create_my_custom_activity_mode('00000000-0000-4000-8000-00000000c104', 'Đi dạo', 'camera', '#22c55e')$$, 'a retry with the same details returns the saved mode');
select throws_ok($$select * from public.create_my_custom_activity_mode('00000000-0000-4000-8000-00000000c105', 'Đi dạo', 'book', '#3b82f6')$$, 'P0001', 'custom mode name already exists', 'a person cannot create a conflicting duplicate name');
select is((select mode from public.custom_activity_modes where user_id = '00000000-0000-4000-8000-000000000101' and label = 'Đi dạo'), 'custom_0000000000004000800000000000c101', 'the server makes a stable key for the saved mode');
select lives_ok($$select public.set_my_activity_mode('custom_0000000000004000800000000000c101', 60)$$, 'the owner can turn their custom mode on');
select is((select mode_label || ' ' || mode_icon || ' ' || mode_color from public.list_visible_activity_modes() where user_id = '00000000-0000-4000-8000-000000000101'), 'Đi dạo camera #22c55e', 'the owner receives the custom presentation');
select is((select count(*) from public.custom_activity_modes where user_id = '00000000-0000-4000-8000-000000000101'), 2::bigint, 'the owner can read their catalog');

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000102', true);
select is((select mode_label || ' ' || mode_icon || ' ' || mode_color from public.list_visible_activity_modes() where user_id = '00000000-0000-4000-8000-000000000101'), 'Đi dạo camera #22c55e', 'an accepted friend sees the presentation while it is active');
select is((select count(*) from public.custom_activity_modes where user_id = '00000000-0000-4000-8000-000000000101'), 1::bigint, 'an accepted friend can read the active custom mode');
select throws_ok($$select public.set_my_activity_mode('custom_0000000000004000800000000000c101', 60)$$, 'P0001', 'invalid activity mode or duration', 'a friend cannot turn on someone else''s custom mode');

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000103', true);
select is((select count(*) from public.list_visible_activity_modes() where user_id = '00000000-0000-4000-8000-000000000101'), 0::bigint, 'a stranger cannot see an active custom mode');

select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000101', true);
select lives_ok($$select public.set_my_activity_mode(null, 60)$$, 'the owner can turn off the custom mode');
select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000102', true);
select is((select count(*) from public.list_visible_activity_modes() where user_id = '00000000-0000-4000-8000-000000000101'), 0::bigint, 'the friend no longer sees the custom mode after it turns off');
select is((select count(*) from public.custom_activity_modes where user_id = '00000000-0000-4000-8000-000000000101'), 0::bigint, 'the friend no longer reads the custom mode after it turns off');
select throws_ok($$select * from public.create_my_custom_activity_mode('00000000-0000-4000-8000-00000000c102', 'Sai icon', 'alien', '#22c55e')$$, 'P0001', 'invalid custom mode', 'the server accepts only app-supported icon and color choices');

reset role;
set local role anon;
select throws_ok($$select * from public.create_my_custom_activity_mode('00000000-0000-4000-8000-00000000c103', 'Ẩn danh', 'camera', '#22c55e')$$, '42501', null, 'an anonymous visitor cannot create a mode');
reset role;
select * from finish();
rollback;

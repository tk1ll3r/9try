-- Disposable local database only; all fixtures roll back.
begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

select set_config('test.public_site_metrics.expected_users',
  (select (count(*) + 2)::text from public.profiles), true);
select set_config('test.public_site_metrics.expected_visits',
  (select landing_page_views::text from public.public_site_metrics where singleton), true);

insert into auth.users(id, instance_id, aud, role, email)
values
 ('00000000-0000-4000-8000-000000005001','00000000-0000-0000-0000-000000000000','authenticated','authenticated','metrics-a@example.invalid'),
 ('00000000-0000-4000-8000-000000005002','00000000-0000-0000-0000-000000000000','authenticated','authenticated','metrics-b@example.invalid');

select is(has_table_privilege('anon','public.public_site_metrics','SELECT'),false,'anonymous visitors cannot read the counter table');
select is(has_table_privilege('anon','public.public_site_metrics','UPDATE'),false,'anonymous visitors cannot change the counter table');
select is(has_table_privilege('authenticated','public.public_site_metrics','SELECT'),false,'signed-in users cannot read the counter table');
select is(has_function_privilege('anon','public.get_public_site_metrics()','EXECUTE'),true,'anonymous visitors can read the aggregate endpoint');
select is(has_function_privilege('anon','public.record_public_landing_view()','EXECUTE'),true,'anonymous visitors can record a landing-page view');
select is(has_function_privilege('authenticated','public.get_public_site_metrics()','EXECUTE'),false,'the read endpoint is not granted to signed-in users');
select is(has_function_privilege('authenticated','public.record_public_landing_view()','EXECUTE'),false,'the write endpoint is not granted to signed-in users');

set local role anon;
select is((select total_users from public.get_public_site_metrics()),current_setting('test.public_site_metrics.expected_users')::bigint,'the aggregate reports the member count');
select is((select total_visits from public.get_public_site_metrics()),current_setting('test.public_site_metrics.expected_visits')::bigint,'the visit count retains its deployed historical baseline');
select is((select total_users::text || ':' || total_visits::text from public.record_public_landing_view()),current_setting('test.public_site_metrics.expected_users') || ':' || (current_setting('test.public_site_metrics.expected_visits')::bigint + 1)::text,'a visit increments once and returns aggregates');
select is((select total_visits from public.get_public_site_metrics()),current_setting('test.public_site_metrics.expected_visits')::bigint + 1,'the next read sees the new visit');
select is((select total_users::text || ':' || total_visits::text from public.record_public_landing_view()),current_setting('test.public_site_metrics.expected_users') || ':' || (current_setting('test.public_site_metrics.expected_visits')::bigint + 2)::text,'a second page opening increments once');
reset role;

select is((select landing_page_views from public.public_site_metrics where singleton),current_setting('test.public_site_metrics.expected_visits')::bigint + 2,'the counter is persisted');
delete from auth.users where id='00000000-0000-4000-8000-000000005001';
select is((select total_users from public.get_public_site_metrics()),current_setting('test.public_site_metrics.expected_users')::bigint - 1,'deleting an account updates the member count');

select * from finish();
rollback;

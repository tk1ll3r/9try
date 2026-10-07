-- Disposable local database only; all fixtures roll back.
begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

insert into auth.users(id, instance_id, aud, role, email)
values
 ('00000000-0000-4000-8000-000000000601','00000000-0000-0000-0000-000000000000','authenticated','authenticated','pipe-a@example.invalid'),
 ('00000000-0000-4000-8000-000000000602','00000000-0000-0000-0000-000000000000','authenticated','authenticated','pipe-b@example.invalid');
update public.profiles set username='pipe_b' where id='00000000-0000-4000-8000-000000000602';

-- A social notification: stored, announced, queued for push.
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000601',true);
select public.send_friend_request('pipe_b');
reset role;
select is((select count(*) from public.notifications where user_id='00000000-0000-4000-8000-000000000602'),1::bigint,'the friend request creates one notification');
select is((select count(*) from public.reminders r join public.notifications n on n.dedupe_key=r.idempotency_key
  where n.user_id='00000000-0000-4000-8000-000000000602' and r.status='pending' and r.category='friend_request'),1::bigint,'it is queued for push under the same key');
select is((select count(*) from realtime.messages where topic='user:00000000-0000-4000-8000-000000000602' and event='notifications'),1::bigint,'it is announced on the recipient topic');
select is((select count(*) from realtime.messages where topic='user:00000000-0000-4000-8000-000000000601' and event='notifications'),0::bigint,'the sender gets no notification event');

-- The worker claims the queue entry and upserts the notification by key: no second row, no re-queue.
update public.reminders set status='processing', attempts=1 where user_id='00000000-0000-4000-8000-000000000602';
insert into public.notifications(user_id, category, title, body, action_path, dedupe_key)
select user_id, category, 'x', '', null, idempotency_key from public.reminders where user_id='00000000-0000-4000-8000-000000000602'
on conflict (dedupe_key) do nothing;
select is((select count(*) from public.notifications where user_id='00000000-0000-4000-8000-000000000602'),1::bigint,'the worker upsert does not duplicate the notification');
select is((select status from public.reminders where user_id='00000000-0000-4000-8000-000000000602'),'processing','the queue entry stays with the worker');

-- A personal reminder: the worker writes the notification itself.
insert into public.reminders(user_id, category, due_at, payload, idempotency_key, status)
values ('00000000-0000-4000-8000-000000000601','personal_reminder',now(),'{"title":"Nhắc"}','personal-key','processing');
insert into public.notifications(user_id, category, title, dedupe_key)
values ('00000000-0000-4000-8000-000000000601','personal_reminder','Nhắc','personal-key');
select is((select count(*) from public.reminders where user_id='00000000-0000-4000-8000-000000000601'),1::bigint,'a worker-written notification is not queued again');
select is((select count(*) from realtime.messages where topic='user:00000000-0000-4000-8000-000000000601' and event='notifications'),1::bigint,'but it is still announced');

select * from finish();
rollback;

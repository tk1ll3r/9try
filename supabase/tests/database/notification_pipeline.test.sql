-- Disposable local database only; all fixtures roll back.
begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

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

-- Without the worker: the database puts a due reminder into the inbox itself (migration 0030).
insert into public.reminders(user_id, category, due_at, payload, idempotency_key)
values
 ('00000000-0000-4000-8000-000000000601','personal_reminder',now()-interval '1 minute','{"title":"Uống nước","body":"","action_path":"/me/organizer"}','due-key'),
 ('00000000-0000-4000-8000-000000000601','personal_reminder',now()+interval '1 hour','{"title":"Chưa tới giờ"}','later-key'),
 ('00000000-0000-4000-8000-000000000601','personal_reminder',now()-interval '2 days','{"title":"Quá muộn"}','late-key'),
 ('00000000-0000-4000-8000-000000000601','personal_reminder',now()-interval '8 days','{"title":"Từ tuần trước"}','week-old-key');
select is(private.deliver_due_reminders(),1,'one due reminder goes to the inbox');
select is((select title||'|'||action_path from public.notifications where dedupe_key='due-key'),'Uống nước|/me/organizer','with its title and the screen it opens');
select is((select status from public.reminders where idempotency_key='due-key'),'pending','its queue entry stays pending, for the worker to push');
select is(private.deliver_due_reminders(),0,'a second run adds nothing');
select is((select count(*) from public.notifications where dedupe_key in ('later-key','late-key','week-old-key')),0::bigint,'a reminder that is not due yet, or more than a day late, is left alone');
select is((select count(*) from cron.job where jobname='deliver-due-reminders' and schedule='* * * * *'),1::bigint,'the delivery is scheduled every minute');
set local role authenticated;
select throws_ok($$ select private.deliver_due_reminders() $$,'42501',null,'a signed-in user cannot run the delivery');
reset role;

-- Where no worker runs, queue entries are never pushed. They are dropped after a week.
select private.purge_old_records();
select is((select string_agg(idempotency_key, ',' order by idempotency_key) from public.reminders where idempotency_key in ('due-key','later-key','late-key','week-old-key')),
  'due-key,late-key,later-key','a queue entry that waited a week is dropped; newer and future ones stay');

select * from finish();
rollback;

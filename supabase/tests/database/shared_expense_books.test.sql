-- Disposable local database only; all fixtures roll back.
-- o = f01 holds the capability and keeps the books. e = f02 (editor) and v = f03 (viewer) are friends of o.
-- x = f04 is a friend who is then unfriended, k = f05 a friend who is then blocked. s = f06 is a stranger
-- with the capability, n = f07 a stranger without it. g = f08 owns a group that o and m = f09 are in.
begin;
create extension if not exists pgtap with schema extensions;
select plan(81);

insert into auth.users(id, instance_id, aud, role, email)
select ('00000000-0000-4000-8000-000000000f0' || n)::uuid, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'book-' || n || '@example.invalid'
from generate_series(1, 9) n;
update public.profiles set display_name = 'Chủ sổ' where id = '00000000-0000-4000-8000-000000000f01';
update public.profiles set display_name = 'Linh' where id = '00000000-0000-4000-8000-000000000f02';
update public.profiles set display_name = 'Vân' where id = '00000000-0000-4000-8000-000000000f03';
update public.profiles set display_name = 'Minh' where id = '00000000-0000-4000-8000-000000000f09';
insert into public.friendships(requester_id, addressee_id, status)
select '00000000-0000-4000-8000-000000000f01', ('00000000-0000-4000-8000-000000000f0' || n)::uuid, 'accepted' from generate_series(2, 5) n;
insert into public.groups(id, owner_id, name, member_count) values ('00000000-0000-4000-8000-000000000fb1', '00000000-0000-4000-8000-000000000f08', 'Lớp KTPM', 3);
insert into public.group_memberships(group_id, user_id, role) values
  ('00000000-0000-4000-8000-000000000fb1', '00000000-0000-4000-8000-000000000f08', 'owner'),
  ('00000000-0000-4000-8000-000000000fb1', '00000000-0000-4000-8000-000000000f01', 'member'),
  ('00000000-0000-4000-8000-000000000fb1', '00000000-0000-4000-8000-000000000f09', 'member');
select private.grant_feature('00000000-0000-4000-8000-000000000f01', 'couple_expenses');
select private.grant_feature('00000000-0000-4000-8000-000000000f06', 'couple_expenses');
delete from realtime.messages;
delete from public.notifications;

create function pg_temp.as(n text) returns void language sql as $$ select set_config('request.jwt.claim.sub', '00000000-0000-4000-8000-000000000f0' || n, true) $$;
create function pg_temp.book() returns uuid language sql stable as $$ select current_setting('test.book')::uuid $$;
-- The entry of a book that stands for an account, by the last digit of the account.
create function pg_temp.who(n text) returns uuid language sql stable security definer as $$
  select p.id from public.expense_participants p where p.book_id = current_setting('test.book')::uuid and p.linked_user_id = ('00000000-0000-4000-8000-000000000f0' || n)::uuid
$$;
-- What a person is owed in the book: paid, minus their parts, plus what they paid back, minus what they got back.
create function pg_temp.owed(n text) returns bigint language sql stable security definer as $$
  select coalesce((select sum(amount) from public.expenses where payer_id = pg_temp.who(n)), 0)::bigint
       - coalesce((select sum(amount) from public.expense_splits where participant_id = pg_temp.who(n)), 0)::bigint
       + coalesce((select sum(amount) from public.expense_settlements where from_participant_id = pg_temp.who(n)), 0)::bigint
       - coalesce((select sum(amount) from public.expense_settlements where to_participant_id = pg_temp.who(n)), 0)::bigint
$$;

-- Creating a book needs the capability.
set local role authenticated;
select pg_temp.as('7');
select throws_ok($$select public.create_expense_book('Lén')$$, 'P0001', 'feature not granted', 'an account without the capability cannot create a book');
select is((select count(*) from public.my_features()), 0::bigint, 'and is shown no screen for it');
select pg_temp.as('1');
select set_config('test.first', public.open_expense_book()::text, true);
select lives_ok($$select set_config('test.book', public.create_expense_book('  Hai đứa  ')::text, true)$$, 'an owner creates a second book');
select is((select count(*) || ' ' || string_agg(name, ', ' order by created_at) from public.list_expense_books()), '2 Chi tiêu chung, Hai đứa', 'and has both, by name');
select is((select string_agg(display_name || ':' || coalesce(linked_name, '-'), ', ') from public.list_book_people(pg_temp.book())), 'Chủ sổ:Chủ sổ', 'a new book starts with its owner under their own name');
select throws_ok($$select public.create_expense_book('   ')$$, 'P0001', 'invalid book name', 'a book needs a name');

-- Inviting: friends only, and nothing is shown before the answer.
select throws_ok($$select public.invite_to_book(pg_temp.book(), '00000000-0000-4000-8000-000000000f06')$$, 'P0001', 'book invite unavailable', 'a stranger cannot be invited');
select throws_ok($$select public.invite_to_book(pg_temp.book(), '00000000-0000-4000-8000-000000000f02', 'owner')$$, 'P0001', 'invalid role', 'nobody is invited as a second owner');
select lives_ok($$select public.invite_to_book(pg_temp.book(), '00000000-0000-4000-8000-000000000f02', 'editor')$$, 'a friend is invited as editor');
select lives_ok($$select public.invite_to_book(pg_temp.book(), '00000000-0000-4000-8000-000000000f03', 'viewer')$$, 'another as viewer');
select public.invite_to_book(pg_temp.book(), '00000000-0000-4000-8000-000000000f04', 'editor');
select public.invite_to_book(pg_temp.book(), '00000000-0000-4000-8000-000000000f05', 'editor');
select public.save_expense(null, 90000, pg_temp.who('1'), null, null, null, 'Trước khi mời', null, null, pg_temp.book());

select pg_temp.as('2');
select is((select status || ' ' || name || ' ' || invited_by_name from public.list_expense_books()), 'invited Hai đứa Chủ sổ', 'the invited person sees the book''s name and who invited them');
select is((select array_agg(f) from public.my_features() f), array['expenses'], 'and is shown the screen, without any capability');
select is((select count(*) from public.expense_books) + (select count(*) from public.expenses) + (select count(*) from public.expense_participants), 0::bigint, 'but reads nothing of the book before saying yes');
select throws_ok($$select public.save_expense(null, 1000, '00000000-0000-4000-8000-000000000f01', null, null, null, '', null, null, pg_temp.book())$$, 'P0001', 'expense book not found', 'and writes nothing into it');
select is((select count(*) from public.notifications where category = 'expenses' and title = 'Chủ sổ mời bạn vào sổ chi tiêu' and body = 'Hai đứa'), 1::bigint, 'the invitation is in their inbox');
select lives_ok($$select public.answer_book_invite(pg_temp.book(), true)$$, 'the editor accepts');
select is((select role || ' ' || status || ' ' || member_count from public.list_expense_books()), 'editor active 2', 'and is in the book as editor');
select is((select count(*) from public.notifications where category = 'expenses'), 0::bigint, 'the invitation leaves the inbox');
select pg_temp.as('3');
select public.answer_book_invite(pg_temp.book(), true);
select pg_temp.as('4');
select public.answer_book_invite(pg_temp.book(), true);
select pg_temp.as('5');
select public.answer_book_invite(pg_temp.book(), true);
select throws_ok($$select public.answer_book_invite(pg_temp.book(), true)$$, 'P0001', 'invitation not found', 'an invitation is answered once');

-- The editor: reads, adds, and changes what they wrote.
select pg_temp.as('2');
select is((select count(*) from public.expenses), 1::bigint, 'the editor reads what was in the book before they came');
select is((select string_agg(display_name, ', ' order by "position") from public.list_book_people(pg_temp.book())), 'Chủ sổ, Linh, Vân, Một người bạn, Một người bạn', 'everyone who accepted has a name in the book');
select lives_ok($$select public.save_expense(null, 300000, pg_temp.who('2'), null, null, null, 'Ăn tối', null, null, pg_temp.book())$$, 'the editor adds an expense that they paid');
select is((select created_by from public.expenses where note = 'Ăn tối'), '00000000-0000-4000-8000-000000000f02'::uuid, 'which is theirs');
select lives_ok($$select public.save_expense((select id from public.expenses where note = 'Ăn tối'), 350000, pg_temp.who('2'), null, null, null, 'Ăn tối', null, 1, pg_temp.book())$$, 'and can be changed by them');
select throws_ok($$select public.save_expense((select id from public.expenses where note = 'Trước khi mời'), 1, pg_temp.who('1'), null, null, null, 'x', null, 1)$$, 'P0001', 'not your entry', 'the owner''s entry is not the editor''s to change');
select throws_ok($$select public.delete_expense((select id from public.expenses where note = 'Trước khi mời'))$$, 'P0001', 'not your entry', 'nor to delete');
select lives_ok($$insert into public.expense_categories(book_id, name) values (pg_temp.book(), 'Du lịch')$$, 'an editor adds a category');
select lives_ok($$insert into public.expense_outings(book_id, title) values (pg_temp.book(), 'Đà Lạt')$$, 'and an outing');
select lives_ok($$update public.expense_books set name = 'Của tôi' where id = pg_temp.book()$$, 'an editor who tries to rename the book reaches no row');
select is((select name from public.expense_books where id = pg_temp.book()), 'Hai đứa', 'the name stands');
select throws_ok($$select public.invite_to_book(pg_temp.book(), '00000000-0000-4000-8000-000000000f03')$$, 'P0001', 'expense book not found', 'an editor invites nobody');
select throws_ok($$select public.set_book_member(pg_temp.book(), '00000000-0000-4000-8000-000000000f02', 'viewer')$$, 'P0001', 'expense book not found', 'changes no role');
select throws_ok($$select public.remove_book_member(pg_temp.book(), '00000000-0000-4000-8000-000000000f03')$$, 'P0001', 'expense book not found', 'removes nobody');
select throws_ok($$select public.delete_expense_book(pg_temp.book())$$, 'P0001', 'expense book not found', 'and cannot delete the book');
select is((select count(*) from public.expense_books), 1::bigint, 'the editor sees this book and not the owner''s other one');

-- The viewer: reads everything, changes nothing.
select pg_temp.as('3');
select is((select count(*) from public.expenses) || ' ' || (select count(*) from public.expense_audit_log where record_kind = 'expenses'), '2 3', 'the viewer reads the expenses and the history');
select throws_ok($$select public.save_expense(null, 1000, pg_temp.who('3'), null, null, null, '', null, null, pg_temp.book())$$, 'P0001', 'book is read only', 'the viewer adds no expense');
select throws_ok($$select public.save_settlement(null, pg_temp.who('3'), pg_temp.who('1'), 1000, null, '', pg_temp.book())$$, 'P0001', 'book is read only', 'and no repayment');
select throws_ok($$select public.delete_expense((select id from public.expenses where note = 'Ăn tối'))$$, 'P0001', 'book is read only', 'deletes nothing');
select throws_ok($$insert into public.expense_categories(book_id, name) values (pg_temp.book(), 'Lén')$$, '42501', null, 'and cannot write a category past the functions');
select throws_ok($$insert into public.expense_outings(book_id, title) values (pg_temp.book(), 'Lén')$$, '42501', null, 'nor an outing');
select is((select count(*) from public.list_book_members(pg_temp.book())), 5::bigint, 'the viewer sees who is in the book');
select is((select string_agg(distinct actor_name, ', ') from public.list_expense_history(pg_temp.book()) where record_kind = 'expenses'), 'Chủ sổ, Linh', 'and who changed what');

-- The owner: any entry, the roles, the people.
select pg_temp.as('1');
select lives_ok($$select public.save_expense((select id from public.expenses where note = 'Ăn tối'), 300000, pg_temp.who('2'), null, null, null, 'Ăn tối', null, 2)$$, 'the owner changes an editor''s entry');
select throws_ok($$select public.save_expense((select id from public.expenses where note = 'Ăn tối'), 310000, pg_temp.who('2'), null, null, null, 'Ăn tối', null, 2)$$, 'P0001', 'expense changed elsewhere', 'two people changing one entry: the one with the old version is told');
select lives_ok($$select public.set_book_member(pg_temp.book(), '00000000-0000-4000-8000-000000000f03', 'editor')$$, 'the owner makes the viewer an editor');
select pg_temp.as('3');
select lives_ok($$select public.save_expense(null, 50000, pg_temp.who('3'), null, null, null, 'Trà sữa', '[]'::jsonb || jsonb_build_array(jsonb_build_object('participant_id', pg_temp.who('3'), 'amount', 50000)), null, pg_temp.book())$$, 'who can then add an expense');

-- Five people, an amount that does not divide: the odd đồng stays with the one who paid.
select pg_temp.as('1');
select public.save_expense(null, 100003, pg_temp.who('1'), null, null, null, 'Lẻ', null, null, pg_temp.book());
select is((select string_agg(s.amount::text, '/' order by p.position) from public.expense_splits s join public.expense_participants p on p.id = s.participant_id join public.expenses e on e.id = s.expense_id where e.note = 'Lẻ'),
  '20003/20000/20000/20000/20000', 'an expense is divided among everyone in the book, the odd amount on the one who paid');
select is(pg_temp.owed('1') + pg_temp.owed('2') + pg_temp.owed('3') + pg_temp.owed('4') + pg_temp.owed('5'), 0::bigint, 'what some are owed, the others owe');

-- A repayment is told to the person it names.
select pg_temp.as('2');
select lives_ok($$select public.save_settlement(null, pg_temp.who('2'), pg_temp.who('1'), 20000, null, 'Chuyển khoản', pg_temp.book())$$, 'an editor records a repayment');
reset role;
select is((select count(*) from public.notifications where user_id = '00000000-0000-4000-8000-000000000f01' and title = 'Linh ghi một khoản trả lại' and body = 'Hai đứa'), 1::bigint, 'and the one who was paid back is told');
select is((select count(*) from realtime.messages where event = 'expenses' and topic = 'user:00000000-0000-4000-8000-000000000f03') > 0, true, 'the other people of the book are told that it changed');
select is((select count(*) from realtime.messages where event = 'expenses' and topic in ('user:00000000-0000-4000-8000-000000000f06', 'user:00000000-0000-4000-8000-000000000f07', 'user:00000000-0000-4000-8000-000000000f09')), 0::bigint, 'and nobody outside it');

-- People outside the book.
set local role authenticated;
select pg_temp.as('6');
select is((select count(*) from public.list_expense_books()), 0::bigint, 'a stranger with the capability has none of these books');
select is((select count(*) from public.expenses) + (select count(*) from public.expense_books) + (select count(*) from public.expense_audit_log), 0::bigint, 'and reads nothing of them');
select throws_ok($$select public.save_expense(null, 1000, '00000000-0000-4000-8000-000000000f01', null, null, null, '', null, null, pg_temp.book())$$, 'P0001', 'expense book not found', 'writes nothing into them');
select throws_ok($$select * from public.list_book_members(pg_temp.book())$$, 'P0001', 'expense book not found', 'and does not learn who is in them');
select throws_ok($$select * from public.expense_book_members$$, '42501', null, 'nobody reads the table of members itself');
select pg_temp.as('7');
select is((select count(*) from public.list_expense_books()) + (select count(*) from public.expenses), 0::bigint, 'a stranger without the capability neither');

-- The end of a friendship ends the membership. The name and the entries stay in the book.
select pg_temp.as('1');
select public.remove_friend('00000000-0000-4000-8000-000000000f04');
select public.block_user('00000000-0000-4000-8000-000000000f05');
select pg_temp.as('4');
select is((select count(*) from public.list_expense_books()) + (select count(*) from public.expenses), 0::bigint, 'an ex-friend is out of the book');
select pg_temp.as('5');
select is((select count(*) from public.list_expense_books()) + (select count(*) from public.expenses), 0::bigint, 'and so is a blocked person');
select pg_temp.as('1');
select is((select count(*) from public.list_book_people(pg_temp.book())), 5::bigint, 'their names are still in the book');

-- Leaving, and being taken out.
select pg_temp.as('3');
select lives_ok($$select public.leave_expense_book(pg_temp.book())$$, 'a member leaves');
select is((select count(*) from public.list_expense_books()), 0::bigint, 'and no longer has the book');
select pg_temp.as('1');
select throws_ok($$select public.leave_expense_book(pg_temp.book())$$, 'P0001', 'expense book not found', 'the owner does not leave their own book');
select lives_ok($$select public.remove_book_member(pg_temp.book(), '00000000-0000-4000-8000-000000000f02')$$, 'the owner takes a member out');
select pg_temp.as('2');
select is((select count(*) from public.expenses) + (select count(*) from public.my_features()), 0::bigint, 'who then reads nothing and is shown no screen');

-- A book of a group: everyone in the group is in it, and it follows who joins and who leaves.
select pg_temp.as('6');
select throws_ok($$select public.create_expense_book('Quỹ lớp', '00000000-0000-4000-8000-000000000fb1')$$, 'P0001', 'not in this group', 'a book for a group is created by someone in that group');
select pg_temp.as('1');
select lives_ok($$select set_config('test.group_book', public.create_expense_book('Quỹ lớp', '00000000-0000-4000-8000-000000000fb1', 'viewer')::text, true)$$, 'a capability holder in the group creates its book');
select throws_ok($$select public.create_expense_book('Quỹ lớp 2', '00000000-0000-4000-8000-000000000fb1')$$, 'P0001', 'group already has a book', 'a group has one book');
select pg_temp.as('9');
select is((select role || ' ' || status || ' ' || group_name from public.list_expense_books()), 'viewer active Lớp KTPM', 'a member of the group is in the book at once, as the book says');
select throws_ok($$select public.save_expense(null, 1000, '00000000-0000-4000-8000-000000000f01', null, null, null, '', null, null, current_setting('test.group_book')::uuid)$$, 'P0001', 'book is read only', 'and reads without writing');
reset role;
insert into public.group_memberships(group_id, user_id, role) values ('00000000-0000-4000-8000-000000000fb1', '00000000-0000-4000-8000-000000000f07', 'member');
delete from public.group_memberships where group_id = '00000000-0000-4000-8000-000000000fb1' and user_id = '00000000-0000-4000-8000-000000000f09';
set local role authenticated;
select pg_temp.as('7');
select is((select count(*) from public.list_expense_books()), 1::bigint, 'someone who joins the group is let into its book');
select pg_temp.as('9');
select is((select count(*) from public.list_expense_books()), 0::bigint, 'someone who leaves the group is taken out of it');

-- Without the owner's capability the books are hidden from everyone; the entries stay.
reset role;
select private.revoke_feature('00000000-0000-4000-8000-000000000f01', 'couple_expenses');
set local role authenticated;
select pg_temp.as('7');
select is((select count(*) from public.list_expense_books()) + (select count(*) from public.expenses) + (select count(*) from public.my_features()), 0::bigint, 'when the owner loses the capability a member has no book and no screen');
reset role;
select is((select count(*) from public.expenses where book_id = current_setting('test.book')::uuid), 4::bigint, 'the entries are kept for when it is given again');
select private.grant_feature('00000000-0000-4000-8000-000000000f01', 'couple_expenses');
set local role authenticated;
select pg_temp.as('1');
select lives_ok($$select public.delete_expense_book(pg_temp.book())$$, 'the owner deletes a book');
select is((select string_agg(name, ', ' order by created_at) from public.list_expense_books()), 'Chi tiêu chung, Quỹ lớp', 'and keeps the others');
reset role;

-- A book goes with its owner's account, entries and all.
select lives_ok($$delete from auth.users where id = '00000000-0000-4000-8000-000000000f01'$$, 'the account of an owner with entries in a book can be deleted');
select is((select count(*) from public.expense_books where owner_id = '00000000-0000-4000-8000-000000000f01') + (select count(*) from public.expense_book_members where user_id = '00000000-0000-4000-8000-000000000f01'), 0::bigint, 'and the books go with it');

set local role anon;
select throws_ok($$select public.list_expense_books()$$, '42501', null, 'an anonymous visitor cannot call any of it');
reset role;
select * from finish();
rollback;

-- Disposable local database only; all fixtures roll back.
-- o = e01 keeps the ledger and has the capability. p = e02 is a friend of o without it. q = e03 has it too, with a book of their own.
begin;
create extension if not exists pgtap with schema extensions;
select plan(47);

insert into auth.users(id, instance_id, aud, role, email)
values
  ('00000000-0000-4000-8000-000000000e01','00000000-0000-0000-0000-000000000000','authenticated','authenticated','ledger-o@example.invalid'),
  ('00000000-0000-4000-8000-000000000e02','00000000-0000-0000-0000-000000000000','authenticated','authenticated','ledger-p@example.invalid'),
  ('00000000-0000-4000-8000-000000000e03','00000000-0000-0000-0000-000000000000','authenticated','authenticated','ledger-q@example.invalid');
insert into public.friendships(requester_id, addressee_id, status)
values ('00000000-0000-4000-8000-000000000e01','00000000-0000-4000-8000-000000000e02','accepted');
delete from realtime.messages;

-- Ids of the people and categories in a book, by position, for whoever is signed in.
create function pg_temp.person(n integer) returns uuid language sql stable as $$ select id from public.expense_participants order by position offset n limit 1 $$;
-- Who is owed how much: what a person paid, minus their parts, plus what they paid back, minus what they got back.
create function pg_temp.owed(n integer) returns bigint language sql stable as $$
  select coalesce((select sum(amount) from public.expenses where payer_id = pg_temp.person(n)), 0)
       - coalesce((select sum(amount) from public.expense_splits where participant_id = pg_temp.person(n)), 0)
       + coalesce((select sum(amount) from public.expense_settlements where from_participant_id = pg_temp.person(n)), 0)
       - coalesce((select sum(amount) from public.expense_settlements where to_participant_id = pg_temp.person(n)), 0)
$$;

-- Without the capability there is no ledger to find, and no way to take the capability.
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000e01',true);
select throws_ok($$select public.open_expense_book()$$, 'P0001', 'feature not granted', 'an account without the capability cannot open a book');
select is((select count(*) from public.my_features()), 0::bigint, 'it has no capabilities');
select throws_ok($$insert into public.feature_grants(user_id, feature) values ('00000000-0000-4000-8000-000000000e01', 'couple_expenses')$$, '42501', null, 'it cannot grant itself the capability');
select throws_ok($$select * from public.feature_grants$$, '42501', null, 'nor read the table of grants');
select throws_ok($$select private.grant_feature('00000000-0000-4000-8000-000000000e01', 'couple_expenses')$$, '42501', null, 'nor call the function that grants');
reset role;

-- The administrator grants it, to o and to q.
select private.grant_feature('00000000-0000-4000-8000-000000000e01', 'couple_expenses');
select private.grant_feature('00000000-0000-4000-8000-000000000e03', 'couple_expenses');
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000e03',true);
select public.open_expense_book();
create temp table other_book as select pg_temp.person(0) as person, (select id from public.expense_books) as book;
grant select on other_book to authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000e01',true);
select is((select array_agg(f order by f) from public.my_features() f), array['couple_expenses', 'expenses'], 'the owner now has the capability, and with it the screen');
select lives_ok($$select public.open_expense_book()$$, 'and opens their book');
select is((select count(*) from public.expense_books), 1::bigint, 'the owner sees one book: their own');
select is((select string_agg(display_name, ', ' order by position) from public.expense_participants), 'Tôi, Người ấy', 'with themselves and a partner');
select is((select count(*) from public.expense_categories), 6::bigint, 'and the usual categories');
select is((select linked_user_id from public.expense_participants where position = 1), null, 'the partner is a name, not an account');

-- The example of the plan: the owner pays 600,000 for dinner, the partner 200,000 for transport, both divided evenly.
select public.save_expense(null, 600000, pg_temp.person(0), null, null, null, 'Ăn tối');
select public.save_expense(null, 200000, pg_temp.person(1), null, null, null, 'Đi lại');
select is((select sum(amount) from public.expenses), 800000::numeric, 'together they spent 800,000');
select is((select sum(amount) from public.expense_splits where participant_id = pg_temp.person(0)), 400000::numeric, 'the owner''s part is 400,000');
select is(pg_temp.owed(0), 200000::bigint, 'the partner owes the owner 200,000');
select is(pg_temp.owed(0) + pg_temp.owed(1), 0::bigint, 'what one is owed the other owes');

-- Paying it back clears the balance and adds nothing to what was spent.
select public.save_settlement(null, pg_temp.person(1), pg_temp.person(0), 200000);
select is(pg_temp.owed(0), 0::bigint, 'after the repayment nobody owes anything');
select is((select sum(amount) from public.expenses), 800000::numeric, 'and the spending is still 800,000');
select throws_ok($$select public.save_settlement(null, pg_temp.person(0), pg_temp.person(0), 1000)$$, 'P0001', 'not in this expense book', 'nobody pays themselves back');

-- An amount that does not divide evenly leaves the odd đồng with the one who paid.
select public.save_expense(null, 100001, pg_temp.person(1), null, null, null, 'Cà phê');
select is((select string_agg(s.amount::text, '/' order by p.position) from public.expense_splits s join public.expense_participants p on p.id = s.participant_id join public.expenses e on e.id = s.expense_id where e.note = 'Cà phê'),
  '50000/50001', 'an odd amount: the one who paid takes the odd đồng');

-- A custom division must add up, name each person once, and name only people of this book.
select lives_ok(format($$select public.save_expense(null, 100000, pg_temp.person(0), null, null, null, 'Quà', '[{"participant_id":"%s","amount":70000},{"participant_id":"%s","amount":30000}]')$$, pg_temp.person(0), pg_temp.person(1)), 'a 70/30 division is stored');
select throws_ok(format($$select public.save_expense(null, 100000, pg_temp.person(0), null, null, null, '', '[{"participant_id":"%s","amount":70000},{"participant_id":"%s","amount":20000}]')$$, pg_temp.person(0), pg_temp.person(1)), 'P0001', 'split does not add up', 'parts that do not add up are refused');
select throws_ok(format($$select public.save_expense(null, 100000, pg_temp.person(0), null, null, null, '', '[{"participant_id":"%s","amount":150000},{"participant_id":"%s","amount":-50000}]')$$, pg_temp.person(0), pg_temp.person(1)), 'P0001', 'invalid split', 'so is a negative part');
select throws_ok(format($$select public.save_expense(null, 100000, pg_temp.person(0), null, null, null, '', '[{"participant_id":"%s","amount":50000},{"participant_id":"%s","amount":50000}]')$$, pg_temp.person(0), (select person from other_book)), 'P0001', 'invalid split', 'and a part for someone of another book');
select throws_ok(format($$select public.save_expense(null, 100000, '%s')$$, (select person from other_book)), 'P0001', 'not in this expense book', 'the one who paid must be of this book');
select throws_ok($$select public.save_expense(null, 0, pg_temp.person(0))$$, 'P0001', 'invalid amount', 'an expense of nothing is refused');
select throws_ok($$insert into public.expenses(book_id, amount, payer_id) select id, 5, pg_temp.person(0) from public.expense_books$$, '42501', null, 'an expense cannot be written past the function, where the parts are checked');

-- An edit says which version it started from, and the history keeps what was there before.
select throws_ok($$select public.save_expense((select id from public.expenses where note = 'Ăn tối'), 650000, pg_temp.person(0), null, null, null, 'Ăn tối', null, 7)$$, 'P0001', 'expense changed elsewhere', 'an edit from an old version is refused');
select public.save_expense((select id from public.expenses where note = 'Ăn tối'), 650000, pg_temp.person(0), null, null, null, 'Ăn tối', null, 1);
select is((select amount::text || ' v' || version from public.expenses where note = 'Ăn tối'), '650000 v2', 'an edit from the current version is saved');
select is((select (before->>'amount') || ' → ' || (after->>'amount') || ', ' || jsonb_array_length(before->'splits') || ' parts before' from public.expense_audit_log where operation = 'update' and record_kind = 'expenses'),
  '600000 → 650000, 2 parts before', 'the history has the amount and the parts from before the edit');
select public.delete_expense((select id from public.expenses where note = 'Cà phê'));
select is((select before->>'note' from public.expense_audit_log where operation = 'delete'), 'Cà phê', 'a deleted expense stays in the history');
select throws_ok($$delete from public.expense_audit_log$$, '42501', null, 'the history cannot be erased by its owner');

-- The small lists are written directly, under the same rule, and are in the history too.
select lives_ok($$insert into public.expense_outings(book_id, title) select id, 'Đà Lạt' from public.expense_books$$, 'the owner adds an outing');
select lives_ok($$update public.expense_participants set display_name = 'Linh' where position = 1$$, 'and renames the partner');
select is((select count(*) from public.expense_audit_log where (record_kind = 'expense_outings' and operation = 'insert') or (record_kind = 'expense_participants' and operation = 'update')), 2::bigint, 'both changes are in the history');
select throws_ok($$update public.expense_participants set linked_user_id = '00000000-0000-4000-8000-000000000e02' where position = 1$$, '42501', null, 'a partner cannot be pointed at an account from the app');

-- Another account, a friend of the owner, without the capability: nothing to read, write or find.
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000e02',true);
select is((select count(*) from public.expense_books) + (select count(*) from public.expense_participants) + (select count(*) from public.expense_categories) + (select count(*) from public.expense_outings)
  + (select count(*) from public.expenses) + (select count(*) from public.expense_splits) + (select count(*) from public.expense_settlements) + (select count(*) from public.expense_audit_log), 0::bigint, 'an account without the capability reads nothing from any ledger table');
select throws_ok($$select public.save_expense(null, 1000, '00000000-0000-4000-8000-000000000e01')$$, 'P0001', 'feature not granted', 'and cannot add an expense');
select is((select jsonb_array_length(public.export_my_data()->'expense_books')), 0, 'its data export holds no ledger');
select throws_ok(format($$insert into public.expense_categories(book_id, name) values ('%s', 'Lén')$$, (select book from other_book)), '42501', null, 'it cannot write into a book it knows the id of');

-- Another account with the capability has its own book and cannot reach this one.
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000e03',true);
select is((select count(*) from public.expenses) + (select count(*) from public.expense_settlements) + (select count(*) from public.expense_audit_log where record_kind = 'expenses'), 0::bigint, 'another keeper of a ledger sees none of the owner''s entries');
reset role;
create temp table owners_expense as select id from public.expenses where note = 'Ăn tối';
grant select on owners_expense to authenticated;
set local role authenticated;
select throws_ok($$select public.delete_expense((select id from owners_expense))$$, 'P0001', 'expense not found', 'and cannot delete one by its id');
select throws_ok($$select public.save_expense((select id from owners_expense), 1, pg_temp.person(0), null, null, null, '', null, 2)$$, 'P0001', 'expense not found', 'nor change it');

-- Taking the capability back closes the book at once. The entries stay, for when it is given again.
reset role;
select private.revoke_feature('00000000-0000-4000-8000-000000000e01', 'couple_expenses');
set local role authenticated;
select set_config('request.jwt.claim.sub','00000000-0000-4000-8000-000000000e01',true);
select is((select count(*) from public.expenses) + (select count(*) from public.expense_books), 0::bigint, 'without the capability the owner reads nothing either');
select throws_ok($$select public.save_expense(null, 1000, '00000000-0000-4000-8000-000000000e01')$$, 'P0001', 'feature not granted', 'and writes nothing');
select is((select jsonb_array_length(public.export_my_data()->'expense_books'->0->'expenses')), 3, 'the data export still gives the owner their own entries');
reset role;
select is((select count(*) from realtime.messages where event = 'expenses' and topic not in ('user:00000000-0000-4000-8000-000000000e01', 'user:00000000-0000-4000-8000-000000000e03')), 0::bigint, 'events about a ledger went to its keeper and to nobody else');
set local role anon;
select throws_ok($$select public.open_expense_book()$$, '42501', null, 'an anonymous visitor cannot call any of it');
reset role;
select * from finish();
rollback;

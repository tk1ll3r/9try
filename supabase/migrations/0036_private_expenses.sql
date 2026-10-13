-- A private expense ledger, for the accounts that were given it.
--
-- One person keeps the book: what was spent, who paid, how it is divided between them and their
-- partner, and what was paid back. The partner is a name in the book. They can be chosen as the one
-- who paid, and they get no access by that: a row in `expense_participants` is not a grant.
--
-- Two things must both hold for every read and every change: the account has the capability
-- 'couple_expenses', and the book is its own. Both are checked here, in row level security and in
-- the functions below. The app hides the screen from other accounts, and that is only courtesy.
--
-- Money is a whole number of the currency's smallest unit. VND has no smaller unit than the đồng.

-- 1. Capabilities. An account cannot see this table, let alone write to it. A grant is given and
-- taken back with private.grant_feature / private.revoke_feature, which the API does not expose:
-- they are run in the SQL editor or from a migration, by whoever administers the database.
create table public.feature_grants (
  user_id uuid not null references public.profiles(id) on delete cascade,
  feature text not null check (feature ~ '^[a-z][a-z_]{1,39}$'),
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  primary key (user_id, feature)
);
alter table public.feature_grants enable row level security;
revoke all on public.feature_grants from anon, authenticated;

create function private.grant_feature(p_user_id uuid, p_feature text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.feature_grants(user_id, feature) values (p_user_id, p_feature)
  on conflict (user_id, feature) do update set revoked_at = null, granted_at = now();
  perform private.emit(p_user_id, 'features');
end $$;

-- The data stays. It cannot be reached until the capability is given again.
create function private.revoke_feature(p_user_id uuid, p_feature text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  update public.feature_grants set revoked_at = now() where user_id = p_user_id and feature = p_feature and revoked_at is null;
  perform private.emit(p_user_id, 'features');
  perform private.emit(p_user_id, 'expenses');
end $$;

-- Both answer only about the account that asks.
create function public.has_feature(p_feature text) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.feature_grants g where g.user_id = (select auth.uid()) and g.feature = p_feature and g.revoked_at is null)
$$;

create function public.my_features() returns setof text
language sql stable security definer set search_path = '' as $$
  select g.feature from public.feature_grants g where g.user_id = (select auth.uid()) and g.revoked_at is null
$$;

-- 2. The book.
create table public.expense_books (
  id uuid primary key default gen_random_uuid(),
  -- ponytail: one book for each owner. Drop this unique rule when someone needs a second book.
  owner_id uuid not null unique references public.profiles(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 80),
  currency text not null default 'VND' check (currency ~ '^[A-Z]{3}$'),
  -- How a new expense is divided when nothing else is said: between everyone, or all on the one who paid.
  default_split text not null default 'equal' check (default_split in ('equal', 'payer')),
  created_at timestamptz not null default now()
);

create table public.expense_participants (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.expense_books(id) on delete cascade,
  display_name text not null check (length(trim(display_name)) between 1 and 60),
  -- The owner's own row points to their account. Pointing a partner's row at an account names that
  -- account and gives it nothing.
  linked_user_id uuid references public.profiles(id) on delete set null,
  position integer not null default 0,
  created_at timestamptz not null default now()
);
create index expense_participants_by_book on public.expense_participants(book_id);

create table public.expense_categories (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.expense_books(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 40),
  -- The key of an icon the app knows; an unknown key gets a general one.
  icon text not null default 'other' check (icon ~ '^[a-z][a-z_]{1,29}$'),
  position integer not null default 0
);
create index expense_categories_by_book on public.expense_categories(book_id);

-- A dinner, a trip, a date: something several expenses belong to.
create table public.expense_outings (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.expense_books(id) on delete cascade,
  title text not null check (length(trim(title)) between 1 and 80),
  happened_on date not null default current_date,
  calendar_event_id uuid references public.calendar_events(id) on delete set null,
  meetup_id uuid references public.meetups(id) on delete set null,
  created_at timestamptz not null default now()
);
create index expense_outings_by_book on public.expense_outings(book_id);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.expense_books(id) on delete cascade,
  amount bigint not null check (amount > 0 and amount <= 1000000000000),
  payer_id uuid not null references public.expense_participants(id),
  category_id uuid references public.expense_categories(id) on delete set null,
  outing_id uuid references public.expense_outings(id) on delete set null,
  spent_on date not null default current_date,
  note text not null default '' check (length(note) <= 500),
  -- Counts the saves. An edit says which version it started from, so two devices cannot overwrite each other unseen.
  version integer not null default 1,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index expenses_by_book_day on public.expenses(book_id, spent_on desc);

-- What each person's part of an expense is. The parts of one expense add up to its amount.
create table public.expense_splits (
  expense_id uuid not null references public.expenses(id) on delete cascade,
  participant_id uuid not null references public.expense_participants(id),
  amount bigint not null check (amount >= 0),
  primary key (expense_id, participant_id)
);

-- Money one person gave the other to even things out. It changes who owes whom, not what was spent.
create table public.expense_settlements (
  id uuid primary key default gen_random_uuid(),
  book_id uuid not null references public.expense_books(id) on delete cascade,
  from_participant_id uuid not null references public.expense_participants(id),
  to_participant_id uuid not null references public.expense_participants(id),
  amount bigint not null check (amount > 0 and amount <= 1000000000000),
  settled_on date not null default current_date,
  note text not null default '' check (length(note) <= 500),
  created_at timestamptz not null default now(),
  check (from_participant_id <> to_participant_id)
);
create index expense_settlements_by_book on public.expense_settlements(book_id, settled_on desc);

-- Every change to the book, with what the row was before and after. Rows are only ever added.
create table public.expense_audit_log (
  id bigint generated always as identity primary key,
  book_id uuid not null references public.expense_books(id) on delete cascade,
  actor_id uuid,
  operation text not null check (operation in ('insert', 'update', 'delete')),
  record_kind text not null,
  record_id uuid not null,
  changed_at timestamptz not null default clock_timestamp(),
  before jsonb,
  after jsonb
);
create index expense_audit_by_book on public.expense_audit_log(book_id, changed_at desc);

-- 3. Who may read and write. `can_use_expense_book` is the whole rule in one place.
create function public.can_use_expense_book(p_book_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.has_feature('couple_expenses')
    and exists(select 1 from public.expense_books b where b.id = p_book_id and b.owner_id = (select auth.uid()))
$$;

alter table public.expense_books enable row level security;
alter table public.expense_participants enable row level security;
alter table public.expense_categories enable row level security;
alter table public.expense_outings enable row level security;
alter table public.expenses enable row level security;
alter table public.expense_splits enable row level security;
alter table public.expense_settlements enable row level security;
alter table public.expense_audit_log enable row level security;

revoke all on public.expense_books, public.expense_participants, public.expense_categories, public.expense_outings,
  public.expenses, public.expense_splits, public.expense_settlements, public.expense_audit_log from anon, authenticated;
-- Reads go through the policies. Expenses, their parts, repayments and the history are written only by the
-- functions below; the small lists (categories, outings, names) are written directly, under the same rule.
grant select on public.expense_books, public.expense_participants, public.expense_categories, public.expense_outings,
  public.expenses, public.expense_splits, public.expense_settlements, public.expense_audit_log to authenticated;
grant update (name, default_split) on public.expense_books to authenticated;
grant update (display_name) on public.expense_participants to authenticated;
grant insert (book_id, name, icon, position), update (name, icon, position), delete on public.expense_categories to authenticated;
grant insert (book_id, title, happened_on), update (title, happened_on), delete on public.expense_outings to authenticated;

create policy expense_books_owner on public.expense_books for all to authenticated
  using (owner_id = (select auth.uid()) and public.has_feature('couple_expenses'))
  with check (owner_id = (select auth.uid()) and public.has_feature('couple_expenses'));
create policy expense_participants_owner on public.expense_participants for all to authenticated
  using (public.can_use_expense_book(book_id)) with check (public.can_use_expense_book(book_id));
create policy expense_categories_owner on public.expense_categories for all to authenticated
  using (public.can_use_expense_book(book_id)) with check (public.can_use_expense_book(book_id));
create policy expense_outings_owner on public.expense_outings for all to authenticated
  using (public.can_use_expense_book(book_id)) with check (public.can_use_expense_book(book_id));
create policy expenses_owner_read on public.expenses for select to authenticated using (public.can_use_expense_book(book_id));
create policy expense_splits_owner_read on public.expense_splits for select to authenticated
  using (exists(select 1 from public.expenses e where e.id = expense_id and public.can_use_expense_book(e.book_id)));
create policy expense_settlements_owner_read on public.expense_settlements for select to authenticated using (public.can_use_expense_book(book_id));
create policy expense_audit_owner_read on public.expense_audit_log for select to authenticated using (public.can_use_expense_book(book_id));

-- 4. The history of the small lists is written by a trigger, with the account that made the change.
create function private.audit_expense_row() returns trigger
language plpgsql security definer set search_path = '' as $$
declare before jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end; after jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end; book uuid;
begin
  -- A row of the book itself has no book_id; its own id is the book.
  book := coalesce(coalesce(after, before)->>'book_id', coalesce(after, before)->>'id')::uuid;
  -- When the whole book goes, its history goes with it.
  if exists(select 1 from public.expense_books b where b.id = book) then
    insert into public.expense_audit_log(book_id, actor_id, operation, record_kind, record_id, before, after)
    values (book, (select auth.uid()), lower(tg_op), tg_table_name, (coalesce(after, before)->>'id')::uuid, before, after);
    perform private.emit((select b.owner_id from public.expense_books b where b.id = book), 'expenses');
  end if;
  return null;
end $$;

create trigger expense_books_audit after update on public.expense_books for each row execute function private.audit_expense_row();
create trigger expense_participants_audit after insert or update or delete on public.expense_participants for each row execute function private.audit_expense_row();
create trigger expense_categories_audit after insert or update or delete on public.expense_categories for each row execute function private.audit_expense_row();
create trigger expense_outings_audit after insert or update or delete on public.expense_outings for each row execute function private.audit_expense_row();

-- 5. The functions.

-- The caller's book. The first call makes it: the owner, a partner to rename, and the usual categories.
-- Raises 'feature not granted' for an account without the capability, which then has nothing to discover.
create function public.open_expense_book() returns uuid
language plpgsql security definer set search_path = '' as $$
declare me uuid := (select auth.uid()); book uuid;
begin
  if me is null then raise exception 'not authenticated'; end if;
  if not public.has_feature('couple_expenses') then raise exception 'feature not granted'; end if;
  select b.id into book from public.expense_books b where b.owner_id = me;
  if book is not null then return book; end if;

  insert into public.expense_books(owner_id, name) values (me, 'Chi tiêu chung') returning id into book;
  insert into public.expense_participants(book_id, display_name, linked_user_id, position)
  values (book, 'Tôi', me, 0), (book, 'Người ấy', null, 1);
  insert into public.expense_categories(book_id, name, icon, position) values
    (book, 'Ăn uống', 'food', 0), (book, 'Đi lại', 'transport', 1), (book, 'Mua sắm', 'shopping', 2),
    (book, 'Giải trí', 'fun', 3), (book, 'Nhà cửa', 'home', 4), (book, 'Khác', 'other', 5);
  return book;
end $$;

-- An expense with its parts, as the history keeps it.
create function private.expense_snapshot(p_expense_id uuid) returns jsonb
language sql stable set search_path = '' as $$
  select to_jsonb(e) || jsonb_build_object('splits', coalesce((
    select jsonb_agg(jsonb_build_object('participant_id', s.participant_id, 'amount', s.amount) order by s.participant_id)
    from public.expense_splits s where s.expense_id = e.id), '[]'::jsonb))
  from public.expenses e where e.id = p_expense_id
$$;

-- Adds an expense (p_id null) or changes one. `p_splits` is [{"participant_id": …, "amount": …}, …]
-- and must add up to the amount; without it the book's usual way of dividing is used, and an amount
-- that does not divide evenly leaves the odd đồng with the one who paid. Everyone named must belong
-- to this book. An edit must say the version it started from.
create function public.save_expense(
  p_id uuid, p_amount bigint, p_payer_id uuid, p_spent_on date default null,
  p_category_id uuid default null, p_outing_id uuid default null, p_note text default '',
  p_splits jsonb default null, p_version integer default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid()); book public.expense_books%rowtype; found public.expenses%rowtype;
  target uuid; previous jsonb; parts jsonb; people integer; today date;
begin
  if me is null then raise exception 'not authenticated'; end if;
  if not public.has_feature('couple_expenses') then raise exception 'feature not granted'; end if;
  select * into book from public.expense_books b where b.owner_id = me;
  if book.id is null then raise exception 'expense book not found'; end if;
  if p_amount is null or p_amount <= 0 or p_amount > 1000000000000 then raise exception 'invalid amount'; end if;

  -- Whoever paid, the category and the outing all belong to this book.
  if not exists(select 1 from public.expense_participants p where p.id = p_payer_id and p.book_id = book.id)
     or (p_category_id is not null and not exists(select 1 from public.expense_categories c where c.id = p_category_id and c.book_id = book.id))
     or (p_outing_id is not null and not exists(select 1 from public.expense_outings o where o.id = p_outing_id and o.book_id = book.id)) then
    raise exception 'not in this expense book';
  end if;

  parts := p_splits;
  if parts is null then
    select count(*) into people from public.expense_participants p where p.book_id = book.id;
    select jsonb_agg(jsonb_build_object('participant_id', p.id, 'amount',
      case when book.default_split = 'payer' then case when p.id = p_payer_id then p_amount else 0 end
           else p_amount / people + case when p.id = p_payer_id then p_amount % people else 0 end end))
    into parts from public.expense_participants p where p.book_id = book.id;
  end if;
  if jsonb_typeof(parts) <> 'array'
     or exists(select 1 from jsonb_array_elements(parts) x where (x->>'amount') !~ '^[0-9]{1,13}$')
     or (select count(*) <> count(distinct x->>'participant_id') from jsonb_array_elements(parts) x)
     or exists(select 1 from jsonb_array_elements(parts) x
               where not exists(select 1 from public.expense_participants p where p.id::text = x->>'participant_id' and p.book_id = book.id)) then
    raise exception 'invalid split';
  end if;
  if (select coalesce(sum((x->>'amount')::bigint), 0) from jsonb_array_elements(parts) x) <> p_amount then
    raise exception 'split does not add up';
  end if;

  select (now() at time zone coalesce(p.timezone, 'UTC'))::date into today from public.profiles p where p.id = me;
  if p_id is null then
    insert into public.expenses(book_id, amount, payer_id, category_id, outing_id, spent_on, note)
    values (book.id, p_amount, p_payer_id, p_category_id, p_outing_id, coalesce(p_spent_on, today), left(trim(coalesce(p_note, '')), 500))
    returning id into target;
  else
    select * into found from public.expenses e where e.id = p_id and e.book_id = book.id for update;
    if found.id is null then raise exception 'expense not found'; end if;
    if p_version is distinct from found.version then raise exception 'expense changed elsewhere'; end if;
    previous := private.expense_snapshot(p_id);
    update public.expenses set amount = p_amount, payer_id = p_payer_id, category_id = p_category_id, outing_id = p_outing_id,
      spent_on = coalesce(p_spent_on, spent_on), note = left(trim(coalesce(p_note, '')), 500), version = version + 1, updated_at = now()
    where id = p_id;
    delete from public.expense_splits where expense_id = p_id;
    target := p_id;
  end if;
  insert into public.expense_splits(expense_id, participant_id, amount)
  select target, (x->>'participant_id')::uuid, (x->>'amount')::bigint from jsonb_array_elements(parts) x;

  insert into public.expense_audit_log(book_id, actor_id, operation, record_kind, record_id, before, after)
  values (book.id, me, case when p_id is null then 'insert' else 'update' end, 'expenses', target, previous, private.expense_snapshot(target));
  perform private.emit(me, 'expenses');
  return target;
end $$;

create function public.delete_expense(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := (select auth.uid()); book uuid; previous jsonb;
begin
  if me is null then raise exception 'not authenticated'; end if;
  if not public.has_feature('couple_expenses') then raise exception 'feature not granted'; end if;
  select e.book_id into book from public.expenses e join public.expense_books b on b.id = e.book_id where e.id = p_id and b.owner_id = me;
  if book is null then raise exception 'expense not found'; end if;
  previous := private.expense_snapshot(p_id);
  delete from public.expenses where id = p_id;
  insert into public.expense_audit_log(book_id, actor_id, operation, record_kind, record_id, before)
  values (book, me, 'delete', 'expenses', p_id, previous);
  perform private.emit(me, 'expenses');
end $$;

-- Records that one person gave the other money back (p_id null), or changes such a record.
create function public.save_settlement(
  p_id uuid, p_from_participant_id uuid, p_to_participant_id uuid, p_amount bigint, p_settled_on date default null, p_note text default ''
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare me uuid := (select auth.uid()); book uuid; target uuid; previous jsonb; today date;
begin
  if me is null then raise exception 'not authenticated'; end if;
  if not public.has_feature('couple_expenses') then raise exception 'feature not granted'; end if;
  select b.id into book from public.expense_books b where b.owner_id = me;
  if book is null then raise exception 'expense book not found'; end if;
  if p_amount is null or p_amount <= 0 or p_amount > 1000000000000 then raise exception 'invalid amount'; end if;
  if p_from_participant_id = p_to_participant_id
     or (select count(*) from public.expense_participants p where p.book_id = book and p.id in (p_from_participant_id, p_to_participant_id)) <> 2 then
    raise exception 'not in this expense book';
  end if;

  select (now() at time zone coalesce(p.timezone, 'UTC'))::date into today from public.profiles p where p.id = me;
  if p_id is null then
    insert into public.expense_settlements(book_id, from_participant_id, to_participant_id, amount, settled_on, note)
    values (book, p_from_participant_id, p_to_participant_id, p_amount, coalesce(p_settled_on, today), left(trim(coalesce(p_note, '')), 500))
    returning id into target;
  else
    select to_jsonb(s) into previous from public.expense_settlements s where s.id = p_id and s.book_id = book for update;
    if previous is null then raise exception 'expense not found'; end if;
    update public.expense_settlements set from_participant_id = p_from_participant_id, to_participant_id = p_to_participant_id,
      amount = p_amount, settled_on = coalesce(p_settled_on, settled_on), note = left(trim(coalesce(p_note, '')), 500)
    where id = p_id;
    target := p_id;
  end if;
  insert into public.expense_audit_log(book_id, actor_id, operation, record_kind, record_id, before, after)
  values (book, me, case when p_id is null then 'insert' else 'update' end, 'expense_settlements', target, previous,
    (select to_jsonb(s) from public.expense_settlements s where s.id = target));
  perform private.emit(me, 'expenses');
  return target;
end $$;

create function public.delete_settlement(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := (select auth.uid()); book uuid; previous jsonb;
begin
  if me is null then raise exception 'not authenticated'; end if;
  if not public.has_feature('couple_expenses') then raise exception 'feature not granted'; end if;
  select s.book_id, to_jsonb(s) into book, previous
  from public.expense_settlements s join public.expense_books b on b.id = s.book_id where s.id = p_id and b.owner_id = me;
  if book is null then raise exception 'expense not found'; end if;
  delete from public.expense_settlements where id = p_id;
  insert into public.expense_audit_log(book_id, actor_id, operation, record_kind, record_id, before)
  values (book, me, 'delete', 'expense_settlements', p_id, previous);
  perform private.emit(me, 'expenses');
end $$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.has_feature(text)', 'public.my_features()', 'public.can_use_expense_book(uuid)', 'public.open_expense_book()',
    'public.save_expense(uuid, bigint, uuid, date, uuid, uuid, text, jsonb, integer)', 'public.delete_expense(uuid)',
    'public.save_settlement(uuid, uuid, uuid, bigint, date, text)', 'public.delete_settlement(uuid)'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

-- A participant who paid for something or owes a part cannot be deleted: the foreign keys refuse.
-- Nothing in the app deletes participants; the book has its owner and one partner.

-- 6. "Tải dữ liệu của bạn" gives a person everything the app stores about them. It now includes the
-- ledger, and the things earlier migrations added without adding them here.
create or replace function public.export_my_data() returns jsonb
language sql stable security definer set search_path = '' as $$
select jsonb_build_object(
  'exported_at', now(),
  'profile', (select to_jsonb(p) from public.profiles p where p.id = auth.uid()),
  'friendships', coalesce((select jsonb_agg(to_jsonb(f)) from public.friendships f where auth.uid() in (f.requester_id, f.addressee_id)), '[]'::jsonb),
  'friend_pins', coalesce((select jsonb_agg(to_jsonb(x)) from public.friend_pins x where x.user_id = auth.uid()), '[]'::jsonb),
  'blocks', coalesce((select jsonb_agg(to_jsonb(b)) from public.blocks b where b.blocker_id = auth.uid()), '[]'::jsonb),
  'group_memberships', coalesce((select jsonb_agg(to_jsonb(gm)) from public.group_memberships gm where gm.user_id = auth.uid()), '[]'::jsonb),
  'meetup_invitations', coalesce((select jsonb_agg(to_jsonb(mi)) from public.meetup_invitees mi where mi.user_id = auth.uid()), '[]'::jsonb),
  'calendar_events', coalesce((select jsonb_agg(to_jsonb(e)) from public.calendar_events e where e.owner_id = auth.uid()), '[]'::jsonb),
  'tasks', coalesce((select jsonb_agg(to_jsonb(t)) from public.personal_tasks t where t.owner_id = auth.uid()), '[]'::jsonb),
  'routine_completions', coalesce((select jsonb_agg(to_jsonb(rc)) from public.routine_completions rc join public.personal_tasks t on t.id = rc.task_id where t.owner_id = auth.uid()), '[]'::jsonb),
  'notes', coalesce((select jsonb_agg(to_jsonb(n)) from public.personal_notes n where n.owner_id = auth.uid()), '[]'::jsonb),
  'notifications', coalesce((select jsonb_agg(to_jsonb(n)) from public.notifications n where n.user_id = auth.uid()), '[]'::jsonb),
  'notification_preferences', (select to_jsonb(x) from public.notification_preferences x where x.user_id = auth.uid()),
  -- The name and the dates of each device, without the keys that would let someone push to it.
  'push_devices', coalesce((select jsonb_agg(jsonb_build_object('label', x.label, 'language', x.language, 'created_at', x.created_at, 'last_seen_at', x.last_seen_at)) from public.push_subscriptions x where x.user_id = auth.uid()), '[]'::jsonb),
  'messages_sent', coalesce((select jsonb_agg(to_jsonb(m)) from public.messages m where m.sender_id = auth.uid()), '[]'::jsonb),
  'activity_mode', (select to_jsonb(x) from public.activity_modes x where x.user_id = auth.uid()),
  'presence_settings', (select to_jsonb(x) from public.presence_settings x where x.user_id = auth.uid()),
  'presence_viewers', coalesce((select jsonb_agg(to_jsonb(x)) from public.presence_viewers x where x.user_id = auth.uid()), '[]'::jsonb),
  'schedule_requests', coalesce((select jsonb_agg(to_jsonb(x)) from public.schedule_requests x where auth.uid() in (x.requester_id, x.owner_id)), '[]'::jsonb),
  'schedule_grants', coalesce((select jsonb_agg(to_jsonb(x)) from public.schedule_grants x where auth.uid() in (x.owner_id, x.viewer_id)), '[]'::jsonb),
  'location_sessions', coalesce((select jsonb_agg(to_jsonb(s)) from public.location_sessions s where s.owner_id = auth.uid()), '[]'::jsonb),
  'features', coalesce((select jsonb_agg(to_jsonb(g)) from public.feature_grants g where g.user_id = auth.uid()), '[]'::jsonb),
  -- The ledger belongs to the one who keeps it, whether or not the capability holds today.
  'expense_books', coalesce((select jsonb_agg(to_jsonb(b) || jsonb_build_object(
      'participants', coalesce((select jsonb_agg(to_jsonb(x)) from public.expense_participants x where x.book_id = b.id), '[]'::jsonb),
      'categories', coalesce((select jsonb_agg(to_jsonb(x)) from public.expense_categories x where x.book_id = b.id), '[]'::jsonb),
      'outings', coalesce((select jsonb_agg(to_jsonb(x)) from public.expense_outings x where x.book_id = b.id), '[]'::jsonb),
      'expenses', coalesce((select jsonb_agg(private.expense_snapshot(x.id)) from public.expenses x where x.book_id = b.id), '[]'::jsonb),
      'settlements', coalesce((select jsonb_agg(to_jsonb(x)) from public.expense_settlements x where x.book_id = b.id), '[]'::jsonb),
      'history', coalesce((select jsonb_agg(to_jsonb(x)) from public.expense_audit_log x where x.book_id = b.id), '[]'::jsonb)))
    from public.expense_books b where b.owner_id = auth.uid()), '[]'::jsonb)
)
$$;

-- 7. The grant. The capability goes to the account whose username is tk1ll3r today, by its user id:
-- the id never changes, so renaming the account later neither loses the grant nor passes it on to
-- whoever takes the name. The notice shows the id and the address the account signs in with, to
-- compare with the owner's own. Where no such account exists (a test database, or the account was
-- not made yet), nothing is granted and the notice says how to grant later. To take it back:
--   select private.revoke_feature('<user id>', 'couple_expenses');
do $$
declare target uuid; address text;
begin
  select p.id into target from public.profiles p where lower(p.username) = 'tk1ll3r';
  if target is null then
    raise notice 'No account has the username tk1ll3r, so couple_expenses was granted to nobody. To grant it: select private.grant_feature(''<user id>'', ''couple_expenses'');';
    return;
  end if;
  select u.email into address from auth.users u where u.id = target;
  perform private.grant_feature(target, 'couple_expenses');
  raise notice 'couple_expenses was granted to user % (username tk1ll3r, signs in as %).', target, address;
end $$;

-- Expense books that several accounts use.
--
-- Until now a book had one account: its owner. The partner was a name. Now the owner can let other
-- accounts into a book, each with a role, and can keep a book for a group they are in.
--
--   Who may do what                          owner   editor       viewer   invited   anyone else
--   create a book                            needs the capability 'couple_expenses'
--   see expenses, balances, history          yes     yes          yes      name only  no
--   add an expense or a repayment            yes     yes          no       no         no
--   change or delete an entry                any     their own    no       no         no
--   add categories and outings               yes     yes          no       no         no
--   invite, remove, set roles, rename,
--   delete the book                          yes     no           no       no         no
--   leave the book                           deletes yes          yes      declines   -
--
-- The capability keeps its name and now means "may create books". It is still given and taken back
-- by whoever runs SQL as the database owner. A member needs no capability. A book whose owner lost
-- the capability is hidden from everyone until it is given again, as it was for the owner alone.
--
-- A participant is still a name the book divides between; a row in expense_book_members is the grant.
--
-- An older build keeps working: it opens the owner's first book with open_expense_book() and saves
-- without naming a book, which means that first book.

-- 1. More than one book for an owner, and a book for a group.
alter table public.expense_books drop constraint expense_books_owner_id_key;
alter table public.expense_books
  add column group_id uuid references public.groups(id) on delete set null,
  -- What a member of the group is in the group's book.
  add column group_role text not null default 'editor' check (group_role in ('editor', 'viewer'));
create index expense_books_by_owner on public.expense_books(owner_id, created_at);
create unique index expense_books_one_per_group on public.expense_books(group_id) where group_id is not null;

create table public.expense_book_members (
  book_id uuid not null references public.expense_books(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role text not null check (role in ('owner', 'editor', 'viewer')),
  -- 'invited' until the person says yes. An invitation gives the book's name and nothing else.
  status text not null default 'active' check (status in ('invited', 'active')),
  -- The name in the book that stands for this person.
  participant_id uuid references public.expense_participants(id) on delete set null,
  invited_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (book_id, user_id)
);
create index expense_book_members_by_user on public.expense_book_members(user_id);
alter table public.expense_book_members enable row level security;
revoke all on public.expense_book_members from anon, authenticated;

insert into public.expense_book_members(book_id, user_id, role, status, participant_id)
select b.id, b.owner_id, 'owner', 'active',
  (select p.id from public.expense_participants p where p.book_id = b.id and p.linked_user_id = b.owner_id order by p.position limit 1)
from public.expense_books b;

-- A book can now be deleted, and it always went with its owner's account. Neither worked for a book
-- with entries: the names of the book were deleted first, and the entries that named them refused.
-- The entries now go with the name. No client can delete a name: that only happens with the whole book.
alter table public.expenses drop constraint expenses_payer_id_fkey;
alter table public.expenses add constraint expenses_payer_id_fkey foreign key (payer_id) references public.expense_participants(id) on delete cascade;
alter table public.expense_splits drop constraint expense_splits_participant_id_fkey;
alter table public.expense_splits add constraint expense_splits_participant_id_fkey foreign key (participant_id) references public.expense_participants(id) on delete cascade;
alter table public.expense_settlements drop constraint expense_settlements_from_participant_id_fkey;
alter table public.expense_settlements add constraint expense_settlements_from_participant_id_fkey foreign key (from_participant_id) references public.expense_participants(id) on delete cascade;
alter table public.expense_settlements drop constraint expense_settlements_to_participant_id_fkey;
alter table public.expense_settlements add constraint expense_settlements_to_participant_id_fkey foreign key (to_participant_id) references public.expense_participants(id) on delete cascade;

-- Who wrote an entry. Empty for entries from before: those are the owner's.
alter table public.expenses add column created_by uuid references public.profiles(id) on delete set null;
alter table public.expense_settlements add column created_by uuid references public.profiles(id) on delete set null;

-- 2. The one place that answers what a person is in a book: 'owner', 'editor', 'viewer' or nothing.
create function private.book_role(p_book_id uuid, p_user_id uuid) returns text
language sql stable set search_path = '' as $$
  select m.role from public.expense_book_members m
  join public.expense_books b on b.id = m.book_id
  where m.book_id = p_book_id and m.user_id = p_user_id and m.status = 'active'
    and exists(select 1 from public.feature_grants g where g.user_id = b.owner_id and g.feature = 'couple_expenses' and g.revoked_at is null)
$$;

-- The policies run as the person who reads or writes, who has no access to the `private` schema.
create or replace function public.can_use_expense_book(p_book_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select private.book_role(p_book_id, (select auth.uid())) is not null
$$;
create function public.can_write_expense_book(p_book_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(private.book_role(p_book_id, (select auth.uid())) in ('owner', 'editor'), false)
$$;
create function public.owns_expense_book(p_book_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce(private.book_role(p_book_id, (select auth.uid())) = 'owner', false)
$$;

-- The read policies of expenses, parts, repayments and history ask can_use_expense_book and stand.
-- The four that also let the owner write are replaced, one rule for reading and one for each kind of change.
drop policy expense_books_owner on public.expense_books;
drop policy expense_participants_owner on public.expense_participants;
drop policy expense_categories_owner on public.expense_categories;
drop policy expense_outings_owner on public.expense_outings;
grant update (group_role) on public.expense_books to authenticated;

create policy expense_books_read on public.expense_books for select to authenticated using (public.can_use_expense_book(id));
create policy expense_books_change on public.expense_books for update to authenticated
  using (public.owns_expense_book(id)) with check (public.owns_expense_book(id));
create policy expense_participants_read on public.expense_participants for select to authenticated using (public.can_use_expense_book(book_id));
create policy expense_participants_change on public.expense_participants for update to authenticated
  using (public.owns_expense_book(book_id)) with check (public.owns_expense_book(book_id));
create policy expense_categories_read on public.expense_categories for select to authenticated using (public.can_use_expense_book(book_id));
create policy expense_categories_add on public.expense_categories for insert to authenticated with check (public.can_write_expense_book(book_id));
create policy expense_categories_change on public.expense_categories for update to authenticated
  using (public.can_write_expense_book(book_id)) with check (public.can_write_expense_book(book_id));
create policy expense_categories_remove on public.expense_categories for delete to authenticated using (public.can_write_expense_book(book_id));
create policy expense_outings_read on public.expense_outings for select to authenticated using (public.can_use_expense_book(book_id));
create policy expense_outings_add on public.expense_outings for insert to authenticated with check (public.can_write_expense_book(book_id));
create policy expense_outings_change on public.expense_outings for update to authenticated
  using (public.can_write_expense_book(book_id)) with check (public.can_write_expense_book(book_id));
create policy expense_outings_remove on public.expense_outings for delete to authenticated using (public.can_write_expense_book(book_id));

-- What the app may show an account: the capabilities it was given, and 'expenses' when it has a book
-- to open, be it its own, one it was let into, or one it is invited to.
create or replace function public.my_features() returns setof text
language sql stable security definer set search_path = '' as $$
  select g.feature from public.feature_grants g where g.user_id = (select auth.uid()) and g.revoked_at is null
  union
  select 'expenses' where exists(
    select 1 from public.feature_grants g where g.user_id = (select auth.uid()) and g.feature = 'couple_expenses' and g.revoked_at is null)
    or exists(
      select 1 from public.expense_book_members m join public.expense_books b on b.id = m.book_id
      where m.user_id = (select auth.uid())
        and exists(select 1 from public.feature_grants g where g.user_id = b.owner_id and g.feature = 'couple_expenses' and g.revoked_at is null))
$$;

-- 3. Helpers.
create function private.person_name(p_user_id uuid) returns text
language sql stable set search_path = '' as $$
  select coalesce(nullif(p.display_name, ''), p.username, 'Một người bạn') from public.profiles p where p.id = p_user_id
$$;

-- Every account of a book, the invited ones too: their screens reload when the book changes.
create function private.emit_book(p_book_id uuid) returns void
language sql set search_path = '' as $$
  select private.emit(m.user_id, 'expenses') from public.expense_book_members m where m.book_id = p_book_id;
$$;

create function private.own_expense_book(p_user_id uuid) returns uuid
language sql stable set search_path = '' as $$
  select b.id from public.expense_books b where b.owner_id = p_user_id order by b.created_at, b.id limit 1
$$;

-- A new book with its owner, the usual categories and, for the book of two, a partner to rename.
create function private.make_expense_book(p_owner uuid, p_name text, p_group_id uuid, p_group_role text, p_partner boolean) returns uuid
language plpgsql security definer set search_path = '' as $$
declare book uuid; me_in_book uuid;
begin
  insert into public.expense_books(owner_id, name, group_id, group_role) values (p_owner, p_name, p_group_id, p_group_role) returning id into book;
  insert into public.expense_participants(book_id, display_name, linked_user_id, position)
  values (book, case when p_partner then 'Tôi' else private.person_name(p_owner) end, p_owner, 0) returning id into me_in_book;
  if p_partner then
    insert into public.expense_participants(book_id, display_name, linked_user_id, position) values (book, 'Người ấy', null, 1);
  end if;
  insert into public.expense_categories(book_id, name, icon, position) values
    (book, 'Ăn uống', 'food', 0), (book, 'Đi lại', 'transport', 1), (book, 'Mua sắm', 'shopping', 2),
    (book, 'Giải trí', 'fun', 3), (book, 'Nhà cửa', 'home', 4), (book, 'Khác', 'other', 5);
  insert into public.expense_book_members(book_id, user_id, role, status, participant_id) values (book, p_owner, 'owner', 'active', me_in_book);
  return book;
end $$;

-- Lets a person into a book at once: a name of their own in it, and the membership. Used for the members of a group.
create function private.add_book_person(p_book_id uuid, p_user_id uuid, p_role text, p_by uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare person uuid;
begin
  if exists(select 1 from public.expense_book_members m where m.book_id = p_book_id and m.user_id = p_user_id) then
    update public.expense_book_members m set status = 'active' where m.book_id = p_book_id and m.user_id = p_user_id and m.status = 'invited';
    return;
  end if;
  select p.id into person from public.expense_participants p where p.book_id = p_book_id and p.linked_user_id = p_user_id limit 1;
  if person is null then
    insert into public.expense_participants(book_id, display_name, linked_user_id, position)
    values (p_book_id, left(private.person_name(p_user_id), 60), p_user_id, (select coalesce(max(x.position), 0) + 1 from public.expense_participants x where x.book_id = p_book_id))
    returning id into person;
  end if;
  insert into public.expense_book_members(book_id, user_id, role, status, participant_id, invited_by) values (p_book_id, p_user_id, p_role, 'active', person, p_by);
  perform private.emit(p_user_id, 'features');
end $$;

-- The history of the small lists is told to every account of the book, not to its owner alone.
create or replace function private.audit_expense_row() returns trigger
language plpgsql security definer set search_path = '' as $$
declare before jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end; after jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end; book uuid;
begin
  book := coalesce(coalesce(after, before)->>'book_id', coalesce(after, before)->>'id')::uuid;
  if exists(select 1 from public.expense_books b where b.id = book) then
    insert into public.expense_audit_log(book_id, actor_id, operation, record_kind, record_id, before, after)
    values (book, (select auth.uid()), lower(tg_op), tg_table_name, (coalesce(after, before)->>'id')::uuid, before, after);
    perform private.emit_book(book);
  end if;
  return null;
end $$;

-- 4. Books.

-- The caller's first book, for a build that knows one book. The first call makes it, as before.
create or replace function public.open_expense_book() returns uuid
language plpgsql security definer set search_path = '' as $$
declare me uuid := (select auth.uid()); book uuid;
begin
  if me is null then raise exception 'not authenticated'; end if;
  if not public.has_feature('couple_expenses') then raise exception 'feature not granted'; end if;
  book := private.own_expense_book(me);
  if book is not null then return book; end if;
  return private.make_expense_book(me, 'Chi tiêu chung', null, 'editor', true);
end $$;

-- A new book. With a group: the caller is in that group, the group has no book yet, and every
-- member of the group is in the book at once, as `p_group_role`.
create function public.create_expense_book(p_name text, p_group_id uuid default null, p_group_role text default 'editor') returns uuid
language plpgsql security definer set search_path = '' as $$
declare me uuid := (select auth.uid()); book uuid; member uuid; label text := left(trim(coalesce(p_name, '')), 80);
begin
  if me is null then raise exception 'not authenticated'; end if;
  if not public.has_feature('couple_expenses') then raise exception 'feature not granted'; end if;
  if label = '' then raise exception 'invalid book name'; end if;
  if p_group_role not in ('editor', 'viewer') then raise exception 'invalid role'; end if;
  if p_group_id is not null then
    if not exists(select 1 from public.group_memberships g where g.group_id = p_group_id and g.user_id = me) then raise exception 'not in this group'; end if;
    if exists(select 1 from public.expense_books b where b.group_id = p_group_id) then raise exception 'group already has a book'; end if;
  end if;
  book := private.make_expense_book(me, label, p_group_id, p_group_role, false);
  if p_group_id is not null then
    for member in select g.user_id from public.group_memberships g where g.group_id = p_group_id and g.user_id <> me loop
      perform private.add_book_person(book, member, p_group_role, me);
      perform private.notify(member, 'expenses', private.person_name(me) || ' mở sổ chi tiêu cho nhóm', label, '/expenses/' || book::text, 'bookgroup:' || book::text || ':' || member::text);
    end loop;
  end if;
  perform private.emit_book(book);
  return book;
end $$;

-- The books the caller can open, and the ones they are invited to, with what they are in each.
create function public.list_expense_books()
returns table(
  id uuid, name text, currency text, default_split text, role text, status text, owner_id uuid, owner_name text,
  group_id uuid, group_name text, group_role text, member_count integer, invited_by_name text, created_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select b.id, b.name, b.currency, b.default_split, m.role, m.status, b.owner_id, private.person_name(b.owner_id),
    b.group_id, g.name, b.group_role,
    (select count(*)::integer from public.expense_book_members x where x.book_id = b.id and x.status = 'active'),
    private.person_name(m.invited_by), b.created_at
  from public.expense_book_members m
  join public.expense_books b on b.id = m.book_id
  left join public.groups g on g.id = b.group_id
  where m.user_id = (select auth.uid())
    and exists(select 1 from public.feature_grants f where f.user_id = b.owner_id and f.feature = 'couple_expenses' and f.revoked_at is null)
  order by m.status desc, b.created_at
$$;

-- The names a book divides between, each with the account it stands for, if any, and that account's own name.
create function public.list_book_people(p_book_id uuid)
returns table(id uuid, display_name text, linked_user_id uuid, linked_name text, "position" integer)
language plpgsql stable security definer set search_path = '' as $$
begin
  if private.book_role(p_book_id, (select auth.uid())) is null then raise exception 'expense book not found'; end if;
  return query
  select p.id, p.display_name, p.linked_user_id, case when p.linked_user_id is not null then private.person_name(p.linked_user_id) end, p.position
  from public.expense_participants p where p.book_id = p_book_id order by p.position, p.created_at;
end $$;

-- The accounts of a book, the invited ones too.
create function public.list_book_members(p_book_id uuid)
returns table(user_id uuid, display_name text, avatar_url text, role text, status text, participant_id uuid)
language plpgsql stable security definer set search_path = '' as $$
begin
  if private.book_role(p_book_id, (select auth.uid())) is null then raise exception 'expense book not found'; end if;
  return query
  select m.user_id, private.person_name(m.user_id), p.avatar_url, m.role, m.status, m.participant_id
  from public.expense_book_members m join public.profiles p on p.id = m.user_id
  where m.book_id = p_book_id
  order by (m.role = 'owner') desc, m.created_at;
end $$;

-- The owner invites a friend. `p_participant_id` names the entry of the book that has stood for that
-- person so far ("Người ấy"); what that name paid then becomes theirs. Without it they get a name of their own.
create function public.invite_to_book(p_book_id uuid, p_user_id uuid, p_role text default 'editor', p_participant_id uuid default null) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := (select auth.uid()); book public.expense_books%rowtype;
begin
  if me is null then raise exception 'not authenticated'; end if;
  if private.book_role(p_book_id, me) is distinct from 'owner' then raise exception 'expense book not found'; end if;
  select * into book from public.expense_books b where b.id = p_book_id;
  if p_role not in ('editor', 'viewer') then raise exception 'invalid role'; end if;
  if p_user_id = me or not private.can_contact(me, p_user_id) then raise exception 'book invite unavailable'; end if;
  if exists(select 1 from public.expense_book_members m where m.book_id = p_book_id and m.user_id = p_user_id and m.status = 'active') then raise exception 'already in this book'; end if;
  if p_participant_id is not null and not exists(
    select 1 from public.expense_participants p
    where p.id = p_participant_id and p.book_id = p_book_id and p.linked_user_id is null
      and not exists(select 1 from public.expense_book_members m where m.book_id = p_book_id and m.participant_id = p.id and m.user_id <> p_user_id)) then
    raise exception 'not in this expense book';
  end if;
  insert into public.expense_book_members(book_id, user_id, role, status, participant_id, invited_by) values (p_book_id, p_user_id, p_role, 'invited', p_participant_id, me)
  on conflict (book_id, user_id) do update set role = excluded.role, participant_id = excluded.participant_id, invited_by = excluded.invited_by;
  perform private.notify(p_user_id, 'expenses', private.person_name(me) || ' mời bạn vào sổ chi tiêu', book.name, '/expenses', 'bookinvite:' || p_book_id::text || ':' || p_user_id::text);
  perform private.emit(p_user_id, 'features');
  perform private.emit_book(p_book_id);
end $$;

-- The invited person says yes or no.
create function public.answer_book_invite(p_book_id uuid, p_accept boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := (select auth.uid()); invitation public.expense_book_members%rowtype; book public.expense_books%rowtype; person uuid;
begin
  if me is null then raise exception 'not authenticated'; end if;
  select * into invitation from public.expense_book_members m where m.book_id = p_book_id and m.user_id = me and m.status = 'invited';
  select * into book from public.expense_books b where b.id = p_book_id;
  if invitation.book_id is null or private.book_role(p_book_id, book.owner_id) is null then raise exception 'invitation not found'; end if;
  delete from public.notifications n where n.dedupe_key = 'bookinvite:' || p_book_id::text || ':' || me::text;
  if not p_accept then
    delete from public.expense_book_members m where m.book_id = p_book_id and m.user_id = me;
  else
    person := coalesce(
      (select p.id from public.expense_participants p where p.id = invitation.participant_id and p.book_id = p_book_id and p.linked_user_id is null),
      (select p.id from public.expense_participants p where p.book_id = p_book_id and p.linked_user_id = me limit 1));
    if person is null then
      insert into public.expense_participants(book_id, display_name, linked_user_id, position)
      values (p_book_id, left(private.person_name(me), 60), me, (select coalesce(max(x.position), 0) + 1 from public.expense_participants x where x.book_id = p_book_id))
      returning id into person;
    else
      update public.expense_participants p set linked_user_id = me where p.id = person;
    end if;
    update public.expense_book_members m set status = 'active', participant_id = person where m.book_id = p_book_id and m.user_id = me;
    perform private.notify(book.owner_id, 'expenses', private.person_name(me) || ' đã vào sổ chi tiêu', book.name, '/expenses/' || p_book_id::text, 'bookjoin:' || p_book_id::text || ':' || me::text);
  end if;
  perform private.emit(me, 'features');
  perform private.emit(me, 'notifications');
  perform private.emit(me, 'expenses');
  perform private.emit_book(p_book_id);
end $$;

create function public.set_book_member(p_book_id uuid, p_user_id uuid, p_role text) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := (select auth.uid());
begin
  if me is null then raise exception 'not authenticated'; end if;
  if private.book_role(p_book_id, me) is distinct from 'owner' then raise exception 'expense book not found'; end if;
  if p_role not in ('editor', 'viewer') then raise exception 'invalid role'; end if;
  update public.expense_book_members m set role = p_role where m.book_id = p_book_id and m.user_id = p_user_id and m.role <> 'owner';
  if not found then raise exception 'not in this expense book'; end if;
  perform private.emit_book(p_book_id);
end $$;

-- Takes someone out of a book, or withdraws their invitation. Their name and their entries stay.
create function public.remove_book_member(p_book_id uuid, p_user_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := (select auth.uid());
begin
  if me is null then raise exception 'not authenticated'; end if;
  if private.book_role(p_book_id, me) is distinct from 'owner' then raise exception 'expense book not found'; end if;
  delete from public.expense_book_members m where m.book_id = p_book_id and m.user_id = p_user_id and m.role <> 'owner';
  if not found then raise exception 'not in this expense book'; end if;
  delete from public.notifications n where n.dedupe_key = 'bookinvite:' || p_book_id::text || ':' || p_user_id::text;
  perform private.emit(p_user_id, 'features');
  perform private.emit(p_user_id, 'expenses');
  perform private.emit(p_user_id, 'notifications');
  perform private.emit_book(p_book_id);
end $$;

create function public.leave_expense_book(p_book_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := (select auth.uid());
begin
  if me is null then raise exception 'not authenticated'; end if;
  delete from public.expense_book_members m where m.book_id = p_book_id and m.user_id = me and m.role <> 'owner' and m.status = 'active';
  if not found then raise exception 'expense book not found'; end if;
  perform private.emit(me, 'features');
  perform private.emit(me, 'expenses');
  perform private.emit_book(p_book_id);
end $$;

-- Deletes a book with everything in it, for everyone.
create function public.delete_expense_book(p_book_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := (select auth.uid()); told uuid[];
begin
  if me is null then raise exception 'not authenticated'; end if;
  if private.book_role(p_book_id, me) is distinct from 'owner' then raise exception 'expense book not found'; end if;
  told := array(select m.user_id from public.expense_book_members m where m.book_id = p_book_id);
  delete from public.notifications n where n.dedupe_key like 'book%:' || p_book_id::text || ':%';
  delete from public.expense_books b where b.id = p_book_id;
  perform private.emit(person, 'expenses'), private.emit(person, 'features') from unnest(told) person;
end $$;

-- The last hundred changes of a book, newest first, with who made each.
create function public.list_expense_history(p_book_id uuid)
returns table(id bigint, operation text, record_kind text, changed_at timestamptz, before jsonb, after jsonb, actor_id uuid, actor_name text)
language plpgsql stable security definer set search_path = '' as $$
begin
  if private.book_role(p_book_id, (select auth.uid())) is null then raise exception 'expense book not found'; end if;
  return query
  select l.id, l.operation, l.record_kind, l.changed_at, l.before, l.after, l.actor_id, case when l.actor_id is not null then private.person_name(l.actor_id) end
  from public.expense_audit_log l where l.book_id = p_book_id order by l.changed_at desc, l.id desc limit 100;
end $$;

-- 5. Entries. As in migration 0036, for a book the caller is let into: an editor adds, and changes
-- what they wrote themselves; the owner changes anything; a viewer reads.
drop function public.save_expense(uuid, bigint, uuid, date, uuid, uuid, text, jsonb, integer);
create function public.save_expense(
  p_id uuid, p_amount bigint, p_payer_id uuid, p_spent_on date default null,
  p_category_id uuid default null, p_outing_id uuid default null, p_note text default '',
  p_splits jsonb default null, p_version integer default null, p_book_id uuid default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid()); book public.expense_books%rowtype; entry public.expenses%rowtype; my_role text;
  target uuid; previous jsonb; parts jsonb; people integer; today date;
begin
  if me is null then raise exception 'not authenticated'; end if;
  if p_id is not null then
    select * into entry from public.expenses e where e.id = p_id for update;
    select * into book from public.expense_books b where b.id = entry.book_id;
  else
    -- Without a book named: the caller's own first book, as a build that knows one book means it.
    select * into book from public.expense_books b where b.id = coalesce(p_book_id, private.own_expense_book(me));
  end if;
  my_role := private.book_role(book.id, me);
  if my_role is null then
    if p_id is null and p_book_id is null and not public.has_feature('couple_expenses') then raise exception 'feature not granted'; end if;
    if p_id is null then raise exception 'expense book not found'; else raise exception 'expense not found'; end if;
  end if;
  if my_role = 'viewer' then raise exception 'book is read only'; end if;
  if p_id is not null and my_role <> 'owner' and entry.created_by is distinct from me then raise exception 'not your entry'; end if;
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
    insert into public.expenses(book_id, amount, payer_id, category_id, outing_id, spent_on, note, created_by)
    values (book.id, p_amount, p_payer_id, p_category_id, p_outing_id, coalesce(p_spent_on, today), left(trim(coalesce(p_note, '')), 500), me)
    returning id into target;
  else
    if p_version is distinct from entry.version then raise exception 'expense changed elsewhere'; end if;
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
  perform private.emit_book(book.id);
  return target;
end $$;

create or replace function public.delete_expense(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := (select auth.uid()); entry public.expenses%rowtype; my_role text; previous jsonb;
begin
  if me is null then raise exception 'not authenticated'; end if;
  select * into entry from public.expenses e where e.id = p_id;
  my_role := private.book_role(entry.book_id, me);
  if my_role is null then
    if not public.has_feature('couple_expenses') and not exists(select 1 from public.expense_book_members m where m.user_id = me) then raise exception 'feature not granted'; end if;
    raise exception 'expense not found';
  end if;
  if my_role = 'viewer' then raise exception 'book is read only'; end if;
  if my_role <> 'owner' and entry.created_by is distinct from me then raise exception 'not your entry'; end if;
  previous := private.expense_snapshot(p_id);
  delete from public.expenses where id = p_id;
  insert into public.expense_audit_log(book_id, actor_id, operation, record_kind, record_id, before)
  values (entry.book_id, me, 'delete', 'expenses', p_id, previous);
  perform private.emit_book(entry.book_id);
end $$;

-- A repayment is told to the person it names, when that is another account of the book.
drop function public.save_settlement(uuid, uuid, uuid, bigint, date, text);
create function public.save_settlement(
  p_id uuid, p_from_participant_id uuid, p_to_participant_id uuid, p_amount bigint, p_settled_on date default null, p_note text default '', p_book_id uuid default null
) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  me uuid := (select auth.uid()); book public.expense_books%rowtype; entry public.expense_settlements%rowtype; my_role text;
  target uuid; previous jsonb; today date; named uuid;
begin
  if me is null then raise exception 'not authenticated'; end if;
  if p_id is not null then
    select * into entry from public.expense_settlements s where s.id = p_id for update;
    select * into book from public.expense_books b where b.id = entry.book_id;
  else
    select * into book from public.expense_books b where b.id = coalesce(p_book_id, private.own_expense_book(me));
  end if;
  my_role := private.book_role(book.id, me);
  if my_role is null then
    if p_id is null and p_book_id is null and not public.has_feature('couple_expenses') then raise exception 'feature not granted'; end if;
    if p_id is null then raise exception 'expense book not found'; else raise exception 'expense not found'; end if;
  end if;
  if my_role = 'viewer' then raise exception 'book is read only'; end if;
  if p_id is not null and my_role <> 'owner' and entry.created_by is distinct from me then raise exception 'not your entry'; end if;
  if p_amount is null or p_amount <= 0 or p_amount > 1000000000000 then raise exception 'invalid amount'; end if;
  if p_from_participant_id = p_to_participant_id
     or (select count(*) from public.expense_participants p where p.book_id = book.id and p.id in (p_from_participant_id, p_to_participant_id)) <> 2 then
    raise exception 'not in this expense book';
  end if;

  select (now() at time zone coalesce(p.timezone, 'UTC'))::date into today from public.profiles p where p.id = me;
  if p_id is null then
    insert into public.expense_settlements(book_id, from_participant_id, to_participant_id, amount, settled_on, note, created_by)
    values (book.id, p_from_participant_id, p_to_participant_id, p_amount, coalesce(p_settled_on, today), left(trim(coalesce(p_note, '')), 500), me)
    returning id into target;
    for named in
      select p.linked_user_id from public.expense_participants p
      where p.id in (p_from_participant_id, p_to_participant_id) and p.linked_user_id is not null and p.linked_user_id <> me
        and private.book_role(book.id, p.linked_user_id) is not null
    loop
      perform private.notify(named, 'expenses', private.person_name(me) || ' ghi một khoản trả lại', book.name, '/expenses/' || book.id::text, 'booksettle:' || target::text || ':' || named::text);
    end loop;
  else
    previous := to_jsonb(entry);
    update public.expense_settlements set from_participant_id = p_from_participant_id, to_participant_id = p_to_participant_id,
      amount = p_amount, settled_on = coalesce(p_settled_on, settled_on), note = left(trim(coalesce(p_note, '')), 500)
    where id = p_id;
    target := p_id;
  end if;
  insert into public.expense_audit_log(book_id, actor_id, operation, record_kind, record_id, before, after)
  values (book.id, me, case when p_id is null then 'insert' else 'update' end, 'expense_settlements', target, previous,
    (select to_jsonb(s) from public.expense_settlements s where s.id = target));
  perform private.emit_book(book.id);
  return target;
end $$;

create or replace function public.delete_settlement(p_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare me uuid := (select auth.uid()); entry public.expense_settlements%rowtype; my_role text;
begin
  if me is null then raise exception 'not authenticated'; end if;
  select * into entry from public.expense_settlements s where s.id = p_id;
  my_role := private.book_role(entry.book_id, me);
  if my_role is null then
    if not public.has_feature('couple_expenses') and not exists(select 1 from public.expense_book_members m where m.user_id = me) then raise exception 'feature not granted'; end if;
    raise exception 'expense not found';
  end if;
  if my_role = 'viewer' then raise exception 'book is read only'; end if;
  if my_role <> 'owner' and entry.created_by is distinct from me then raise exception 'not your entry'; end if;
  delete from public.expense_settlements where id = p_id;
  insert into public.expense_audit_log(book_id, actor_id, operation, record_kind, record_id, before)
  values (entry.book_id, me, 'delete', 'expense_settlements', p_id, to_jsonb(entry));
  perform private.emit_book(entry.book_id);
end $$;

-- 6. A group's book follows the group: who joins is let in, who leaves or is removed is taken out.
-- Their name and their entries stay. When the whole group is deleted, the book keeps the people it had.
create function private.after_group_member_for_books() returns trigger
language plpgsql security definer set search_path = '' as $$
declare book record;
begin
  if tg_op = 'INSERT' then
    for book in select b.id, b.group_role, b.owner_id from public.expense_books b where b.group_id = new.group_id loop
      perform private.add_book_person(book.id, new.user_id, book.group_role, book.owner_id);
      perform private.emit_book(book.id);
    end loop;
  elsif exists(select 1 from public.groups g where g.id = old.group_id) then
    delete from public.expense_book_members m using public.expense_books b
    where b.id = m.book_id and b.group_id = old.group_id and m.user_id = old.user_id and m.role <> 'owner';
    if found then
      perform private.emit(old.user_id, 'features');
      perform private.emit(old.user_id, 'expenses');
    end if;
  end if;
  return null;
end $$;
create trigger group_membership_books after insert or delete on public.group_memberships
for each row execute function private.after_group_member_for_books();

-- 7. The end of a friendship ends what the two shared (migration 0034). A book between friends is
-- one of those things: the one who was let in is taken out. A group's book follows the group instead.
create or replace function private.revoke_relationship_grants(a uuid, b uuid) returns void
language sql set search_path = '' as $$
  delete from public.availability_shares s
  where (s.owner_id = a and s.user_id = b) or (s.owner_id = b and s.user_id = a);

  delete from public.location_recipients r
  using public.location_sessions s
  where r.session_id = s.id
    and ((s.owner_id = a and r.user_id = b) or (s.owner_id = b and r.user_id = a));

  delete from public.event_shares e
  using public.calendar_events c
  where e.event_id = c.id
    and ((c.owner_id = a and e.user_id = b) or (c.owner_id = b and e.user_id = a));

  delete from public.friend_pins p
  where (p.user_id = a and p.friend_id = b) or (p.user_id = b and p.friend_id = a);

  delete from public.presence_viewers v
  where (v.user_id = a and v.viewer_id = b) or (v.user_id = b and v.viewer_id = a);

  delete from public.schedule_grants g
  where (g.owner_id = a and g.viewer_id = b) or (g.owner_id = b and g.viewer_id = a);

  update public.schedule_requests r set status = 'cancelled', responded_at = now()
  where r.status = 'pending' and ((r.owner_id = a and r.requester_id = b) or (r.owner_id = b and r.requester_id = a));

  delete from public.expense_book_members m
  using public.expense_books k
  where k.id = m.book_id and k.group_id is null and m.role <> 'owner'
    and ((k.owner_id = a and m.user_id = b) or (k.owner_id = b and m.user_id = a));

  select private.emit(a, 'presence');
  select private.emit(b, 'presence');
  select private.emit(a, 'calendar');
  select private.emit(b, 'calendar');
  select private.emit(a, 'expenses');
  select private.emit(b, 'expenses');
  select private.emit(a, 'features');
  select private.emit(b, 'features');
$$;

do $$
declare f text;
begin
  foreach f in array array[
    'public.can_use_expense_book(uuid)', 'public.can_write_expense_book(uuid)', 'public.owns_expense_book(uuid)', 'public.my_features()',
    'public.open_expense_book()', 'public.create_expense_book(text, uuid, text)', 'public.list_expense_books()', 'public.list_book_people(uuid)',
    'public.list_book_members(uuid)', 'public.invite_to_book(uuid, uuid, text, uuid)', 'public.answer_book_invite(uuid, boolean)',
    'public.set_book_member(uuid, uuid, text)', 'public.remove_book_member(uuid, uuid)', 'public.leave_expense_book(uuid)',
    'public.delete_expense_book(uuid)', 'public.list_expense_history(uuid)',
    'public.save_expense(uuid, bigint, uuid, date, uuid, uuid, text, jsonb, integer, uuid)', 'public.delete_expense(uuid)',
    'public.save_settlement(uuid, uuid, uuid, bigint, date, text, uuid)', 'public.delete_settlement(uuid)'
  ] loop
    execute format('revoke execute on function %s from public, anon', f);
    execute format('grant execute on function %s to authenticated', f);
  end loop;
end $$;

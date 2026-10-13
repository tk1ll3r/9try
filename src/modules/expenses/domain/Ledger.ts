import { t } from "../../../kernel/i18n";

/**
 * What the server says an account may see: the screens of the ledger, for whoever has a book to open
 * (their own, one they were let into, or one they are invited to). The server asks again on every
 * read and change. The same words are in supabase/migrations/0043_shared_expense_books.sql.
 */
export const ledgerFeature = "expenses";
/** The capability to create books. It is given by whoever administers the database, not by the app. */
export const createFeature = "couple_expenses";

/** What a person is in a book. The server holds the same rules; these decide which buttons are shown. */
export type Role = "owner" | "editor" | "viewer";
/** An editor adds entries, categories and outings. A viewer reads. */
export const canWrite = (role: Role) => role !== "viewer";
/** The owner changes any entry; an editor the ones they wrote. An entry from before books were shared is the owner's. */
export const canChange = (entry: { createdBy: string | null }, userId: string, role: Role) => role === "owner" || (role === "editor" && entry.createdBy === userId);

/** A book in the list of the person's books: one they can open, or one they are invited to. */
export interface BookSummary {
  id: string;
  name: string;
  role: Role;
  status: "active" | "invited";
  ownerName: string;
  /** The group the book belongs to, when it is a group's book. */
  groupId: string | null;
  groupName: string | null;
  /** What a member of the group is in the book. */
  groupRole: "editor" | "viewer";
  memberCount: number;
  /** For an invitation: who invited. */
  invitedBy: string;
}

/** An account that is in a book, or invited to it. */
export interface Member {
  userId: string;
  name: string;
  avatarUrl: string | null;
  role: Role;
  status: "active" | "invited";
  /** The name in the book that stands for this account. */
  participantId: string | null;
}

/**
 * Someone the book divides expenses between: a name, which may stand for an account. A name by
 * itself gives nobody access; a membership does.
 */
export interface Participant {
  id: string;
  /** What to call them: "Tôi" for the reader, the account's own name for another account, or the name the owner typed. */
  name: string;
  /** The name as it is stored in the book. */
  label: string;
  /** The reader's own entry. */
  isMe: boolean;
  /** The account this name stands for, if any. */
  userId: string | null;
}

export interface Category {
  id: string;
  name: string;
  /** The key of an icon; see `presentation/icons.ts`. */
  icon: string;
}

/** A dinner, a trip, a date: something several expenses belong to. */
export interface Outing {
  id: string;
  title: string;
  /** "YYYY-MM-DD" */
  happenedOn: string;
}

/** One person's part of an expense, in whole units of the currency. */
export interface Split {
  participantId: string;
  amount: number;
}

export interface Expense {
  id: string;
  amount: number;
  payerId: string;
  categoryId: string | null;
  outingId: string | null;
  /** "YYYY-MM-DD" */
  spentOn: string;
  note: string;
  /** Counts the saves; an edit sends back the one it started from. */
  version: number;
  splits: Split[];
  /** The account that wrote it. Null for an entry from before books were shared. */
  createdBy: string | null;
}

/** Money one person gave the other to even things out. It is not spending. */
export interface Settlement {
  id: string;
  fromId: string;
  toId: string;
  amount: number;
  settledOn: string;
  note: string;
  createdBy: string | null;
}

export interface Book {
  id: string;
  name: string;
  /** What the reader is in this book, and how many accounts are in it. */
  role: Role;
  memberCount: number;
  groupName: string | null;
  currency: string;
  /** How a new expense is divided when nothing else is said. */
  defaultSplit: "equal" | "payer";
  participants: Participant[];
  categories: Category[];
  outings: Outing[];
}

export interface Ledger {
  book: Book;
  expenses: Expense[];
  settlements: Settlement[];
}

/** What the form sends to add or change an expense. Without `splits` the book's usual division is used. */
export interface ExpenseDraft {
  id?: string;
  version?: number;
  amount: number;
  payerId: string;
  spentOn: string;
  categoryId: string | null;
  outingId: string | null;
  note: string;
  splits: Split[];
}

/** One entry of the book's history. `before` and `after` are the row as it was stored. */
export interface Change {
  id: number;
  operation: "insert" | "update" | "delete";
  kind: string;
  at: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  /** Who made the change, by their own name. Empty when the account is gone. */
  actorName: string;
}

export type SplitMode = "equal" | "payer" | "custom";

/**
 * Divides evenly between the people named. An amount that does not divide leaves the odd units with
 * the one who paid, or with the first person when the one who paid has no part (they paid for others).
 */
export function splitEvenly(amount: number, participantIds: readonly string[], payerId: string): Split[] {
  const each = Math.floor(amount / participantIds.length);
  const left = amount - each * participantIds.length;
  const odd = participantIds.includes(payerId) ? payerId : participantIds[0];
  return participantIds.map(participantId => ({ participantId, amount: each + (participantId === odd ? left : 0) }));
}

/** Everything on the one who paid: an expense that is theirs alone. */
export function splitOnPayer(amount: number, participantIds: readonly string[], payerId: string): Split[] {
  return participantIds.map(participantId => ({ participantId, amount: participantId === payerId ? amount : 0 }));
}

/**
 * How an expense is divided, to show it and to open its form on the right choice, and between whom:
 * in a book of more than two, an even division can be among some of its people.
 */
export function divisionOf(expense: Pick<Expense, "amount" | "payerId" | "splits">, participantIds: readonly string[]): { mode: SplitMode; sharers: string[] } {
  const part = (id: string) => expense.splits.find(item => item.participantId === id)?.amount ?? 0;
  const same = (other: Split[]) => participantIds.every(id => part(id) === (other.find(item => item.participantId === id)?.amount ?? 0));
  const all = [...participantIds];
  if (same(splitEvenly(expense.amount, all, expense.payerId))) return { mode: "equal", sharers: all };
  if (same(splitOnPayer(expense.amount, all, expense.payerId))) return { mode: "payer", sharers: all };
  const some = all.filter(id => part(id) > 0);
  return all.length > 2 && some.length > 0 && same(splitEvenly(expense.amount, some, expense.payerId)) ? { mode: "equal", sharers: some } : { mode: "custom", sharers: all };
}
export const splitModeOf = (expense: Pick<Expense, "amount" | "payerId" | "splits">, participantIds: readonly string[]): SplitMode => divisionOf(expense, participantIds).mode;

/** What is wrong with a division, or "". The parts have to add up to the amount; the server checks the same. */
export function splitProblem(amount: number, splits: readonly Split[]): string {
  if (splits.some(part => !Number.isInteger(part.amount) || part.amount < 0)) return t("Mỗi phần phải là một số tiền không âm.");
  const sum = splits.reduce((total, part) => total + part.amount, 0);
  return sum === amount ? "" : t("Các phần cộng lại phải bằng số tiền đã chi.");
}

/**
 * For each person, what the others owe them: what they paid, minus their own parts, plus what they
 * paid back, minus what they were paid back. A negative number is what they owe. The numbers of
 * everyone add up to zero.
 */
export function balances(ledger: Pick<Ledger, "expenses" | "settlements"> & { book: Pick<Book, "participants"> }): Map<string, number> {
  const owed = new Map(ledger.book.participants.map(person => [person.id, 0]));
  const add = (id: string, amount: number) => owed.set(id, (owed.get(id) ?? 0) + amount);
  for (const expense of ledger.expenses) {
    add(expense.payerId, expense.amount);
    for (const part of expense.splits) add(part.participantId, -part.amount);
  }
  for (const paid of ledger.settlements) { add(paid.fromId, paid.amount); add(paid.toId, -paid.amount); }
  return owed;
}

/** Who has to give whom how much for nobody to owe anything, or null when it is even. For the two people of a book. */
export function debt(ledger: Parameters<typeof balances>[0]): { fromId: string; toId: string; amount: number } | null {
  const owed = [...balances(ledger)].sort((a, b) => a[1] - b[1]);
  const [debtor, creditor] = [owed[0], owed[owed.length - 1]];
  return debtor && creditor && debtor[1] < 0 ? { fromId: debtor[0], toId: creditor[0], amount: -debtor[1] } : null;
}

/**
 * The repayments that leave nobody owing anything, for a book of any number of people: the one who
 * owes most pays the one who is owed most, until all are even. At most one fewer than there are people.
 */
export function settleUp(owed: ReadonlyMap<string, number>): { fromId: string; toId: string; amount: number }[] {
  const left = [...owed].filter(([, amount]) => amount !== 0).map(([id, amount]) => ({ id, amount }));
  const payments: { fromId: string; toId: string; amount: number }[] = [];
  for (let guard = 0; guard < 1000; guard++) {
    left.sort((a, b) => a.amount - b.amount);
    const debtor = left[0], creditor = left[left.length - 1];
    if (!debtor || !creditor || debtor.amount >= 0 || creditor.amount <= 0) break;
    const amount = Math.min(-debtor.amount, creditor.amount);
    payments.push({ fromId: debtor.id, toId: creditor.id, amount });
    debtor.amount += amount;
    creditor.amount -= amount;
  }
  return payments;
}

export interface ExpenseFilter {
  /** "YYYY-MM-DD", both included. */
  from?: string;
  to?: string;
  categoryId?: string;
  payerId?: string;
  outingId?: string;
}

export function filterExpenses(expenses: readonly Expense[], filter: ExpenseFilter): Expense[] {
  return expenses.filter(expense => (!filter.from || expense.spentOn >= filter.from) && (!filter.to || expense.spentOn <= filter.to)
    && (!filter.categoryId || expense.categoryId === filter.categoryId) && (!filter.payerId || expense.payerId === filter.payerId)
    && (!filter.outingId || expense.outingId === filter.outingId));
}

export interface Totals {
  total: number;
  /** By participant id: what each paid, and what each one's parts come to. */
  paidBy: Map<string, number>;
  shareOf: Map<string, number>;
  /** By category id; "" for expenses without a category. Largest first. */
  byCategory: [categoryId: string, amount: number][];
  /** By month "YYYY-MM", oldest first, only months with spending. */
  byMonth: [month: string, amount: number][];
}

/** What a set of expenses adds up to. Repayments are not in it: they move money, they do not spend it. */
export function totals(expenses: readonly Expense[]): Totals {
  const paidBy = new Map<string, number>(), shareOf = new Map<string, number>(), category = new Map<string, number>(), month = new Map<string, number>();
  const add = (map: Map<string, number>, key: string, amount: number) => map.set(key, (map.get(key) ?? 0) + amount);
  let total = 0;
  for (const expense of expenses) {
    total += expense.amount;
    add(paidBy, expense.payerId, expense.amount);
    add(category, expense.categoryId ?? "", expense.amount);
    add(month, expense.spentOn.slice(0, 7), expense.amount);
    for (const part of expense.splits) add(shareOf, part.participantId, part.amount);
  }
  return { total, paidBy, shareOf, byCategory: [...category].sort((a, b) => b[1] - a[1]), byMonth: [...month].sort((a, b) => a[0].localeCompare(b[0])) };
}

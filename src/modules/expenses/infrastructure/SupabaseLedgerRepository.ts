import type { SupabaseClient } from "@supabase/supabase-js";
import type { BookSummary, Change, ExpenseDraft, Ledger, Member } from "../domain/Ledger";
import { t } from "../../../kernel/i18n";

/**
 * Expense books in Supabase. Row level security gives each read only the rows of a book the caller
 * is let into; expenses and repayments are written through SQL functions that check the caller's
 * role, the parts of an expense, and keep the history.
 */
export class SupabaseLedgerRepository {
  constructor(private readonly db: SupabaseClient, private readonly userId: string) {}

  private async call(name: string, args: Record<string, unknown> = {}): Promise<any> {
    const { data, error } = await this.db.rpc(name, args);
    if (error) throw error;
    return data;
  }
  private async rows(query: PromiseLike<{ data: any[] | null; error: unknown }>): Promise<any[]> {
    const { data, error } = await query;
    if (error) throw error;
    return data ?? [];
  }

  /**
   * The books the person can open, and the ones they are invited to, invitations first. Someone who
   * may create books and has none gets their first one made, with a partner to rename, as before.
   */
  async books(mayCreate: boolean): Promise<BookSummary[]> {
    let list = (await this.call("list_expense_books")) ?? [];
    if (mayCreate && !list.some((row: any) => row.role === "owner")) {
      await this.call("open_expense_book");
      list = (await this.call("list_expense_books")) ?? [];
    }
    return list.map((row: any): BookSummary => ({
      id: row.id, name: row.name, role: row.role, status: row.status, ownerName: row.owner_name ?? "", groupId: row.group_id ?? null, groupName: row.group_name ?? null,
      groupRole: row.group_role ?? "editor", memberCount: row.member_count ?? 1, invitedBy: row.invited_by_name ?? "",
    }));
  }

  /** One book, whole. */
  async load(summary: BookSummary): Promise<Ledger> {
    const bookId = summary.id;
    // ponytail: the newest 2,000 expenses in one go. Load by month when a book outgrows that.
    const [books, people, categories, outings, expenses, settlements] = await Promise.all([
      this.rows(this.db.from("expense_books").select("id,name,currency,default_split").eq("id", bookId)),
      this.call("list_book_people", { p_book_id: bookId }),
      this.rows(this.db.from("expense_categories").select("id,name,icon,position").eq("book_id", bookId).order("position")),
      this.rows(this.db.from("expense_outings").select("id,title,happened_on").eq("book_id", bookId).order("happened_on", { ascending: false })),
      this.rows(this.db.from("expenses").select("id,amount,payer_id,category_id,outing_id,spent_on,note,version,created_by,expense_splits(participant_id,amount)")
        .eq("book_id", bookId).order("spent_on", { ascending: false }).order("created_at", { ascending: false }).limit(2000)),
      this.rows(this.db.from("expense_settlements").select("id,from_participant_id,to_participant_id,amount,settled_on,note,created_by").eq("book_id", bookId).order("settled_on", { ascending: false })),
    ]);
    const book = books[0];
    if (!book) throw new Error(t("Không mở được sổ này. Có thể bạn không còn ở trong sổ."));
    return {
      book: {
        id: book.id, name: book.name, currency: book.currency, defaultSplit: book.default_split, role: summary.role, memberCount: summary.memberCount, groupName: summary.groupName,
        // The reader is "Tôi". Another account goes by its own name, and a name without an account by what the owner typed.
        participants: (people ?? []).map((row: any) => ({
          id: row.id, label: row.display_name, userId: row.linked_user_id ?? null, isMe: row.linked_user_id === this.userId,
          name: row.linked_user_id === this.userId ? t("Tôi") : row.linked_name || row.display_name,
        })),
        categories: categories.map(row => ({ id: row.id, name: row.name, icon: row.icon })),
        outings: outings.map(row => ({ id: row.id, title: row.title, happenedOn: row.happened_on })),
      },
      expenses: expenses.map(row => ({
        id: row.id, amount: Number(row.amount), payerId: row.payer_id, categoryId: row.category_id, outingId: row.outing_id, spentOn: row.spent_on, note: row.note, version: row.version,
        createdBy: row.created_by ?? null, splits: (row.expense_splits ?? []).map((part: any) => ({ participantId: part.participant_id, amount: Number(part.amount) })),
      })),
      settlements: settlements.map(row => ({ id: row.id, fromId: row.from_participant_id, toId: row.to_participant_id, amount: Number(row.amount), settledOn: row.settled_on, note: row.note, createdBy: row.created_by ?? null })),
    };
  }

  async saveExpense(bookId: string, draft: ExpenseDraft): Promise<void> {
    await this.call("save_expense", {
      p_id: draft.id ?? null, p_amount: draft.amount, p_payer_id: draft.payerId, p_spent_on: draft.spentOn, p_category_id: draft.categoryId, p_outing_id: draft.outingId,
      p_note: draft.note, p_splits: draft.splits.map(part => ({ participant_id: part.participantId, amount: part.amount })), p_version: draft.version ?? null, p_book_id: bookId,
    });
  }
  async deleteExpense(id: string): Promise<void> { await this.call("delete_expense", { p_id: id }); }

  /** Records that `fromId` gave `toId` money back. */
  async saveSettlement(bookId: string, paid: { fromId: string; toId: string; amount: number; settledOn: string; note: string }): Promise<void> {
    await this.call("save_settlement", { p_id: null, p_from_participant_id: paid.fromId, p_to_participant_id: paid.toId, p_amount: paid.amount, p_settled_on: paid.settledOn, p_note: paid.note, p_book_id: bookId });
  }
  async deleteSettlement(id: string): Promise<void> { await this.call("delete_settlement", { p_id: id }); }

  /** A new book. With a group, every member of that group is in it at once, as `groupRole`. */
  async createBook(name: string, groupId: string | null, groupRole: "editor" | "viewer"): Promise<string> {
    return await this.call("create_expense_book", { p_name: name, p_group_id: groupId, p_group_role: groupRole }) as string;
  }
  async deleteBook(bookId: string): Promise<void> { await this.call("delete_expense_book", { p_book_id: bookId }); }
  /** The accounts of a book, the invited ones too. */
  async members(bookId: string): Promise<Member[]> {
    return ((await this.call("list_book_members", { p_book_id: bookId })) ?? []).map((row: any): Member => ({
      userId: row.user_id, name: row.display_name, avatarUrl: row.avatar_url ?? null, role: row.role, status: row.status, participantId: row.participant_id ?? null,
    }));
  }
  /** Invites a friend. `participantId` is the name of the book that has stood for them so far; without it they get one of their own. */
  async invite(bookId: string, userId: string, role: "editor" | "viewer", participantId: string | null): Promise<void> {
    await this.call("invite_to_book", { p_book_id: bookId, p_user_id: userId, p_role: role, p_participant_id: participantId });
  }
  async answerInvite(bookId: string, accept: boolean): Promise<void> { await this.call("answer_book_invite", { p_book_id: bookId, p_accept: accept }); }
  async setRole(bookId: string, userId: string, role: "editor" | "viewer"): Promise<void> { await this.call("set_book_member", { p_book_id: bookId, p_user_id: userId, p_role: role }); }
  async removeMember(bookId: string, userId: string): Promise<void> { await this.call("remove_book_member", { p_book_id: bookId, p_user_id: userId }); }
  async leave(bookId: string): Promise<void> { await this.call("leave_expense_book", { p_book_id: bookId }); }

  private async change(query: PromiseLike<{ error: unknown }>): Promise<void> {
    const { error } = await query;
    if (error) throw error;
  }
  renameParticipant(id: string, name: string) { return this.change(this.db.from("expense_participants").update({ display_name: name.trim() }).eq("id", id)); }
  saveBook(id: string, book: { name: string; defaultSplit: "equal" | "payer" }) { return this.change(this.db.from("expense_books").update({ name: book.name.trim(), default_split: book.defaultSplit }).eq("id", id)); }
  addCategory(bookId: string, name: string, position: number) { return this.change(this.db.from("expense_categories").insert({ book_id: bookId, name: name.trim(), icon: "other", position })); }
  deleteCategory(id: string) { return this.change(this.db.from("expense_categories").delete().eq("id", id)); }
  deleteOuting(id: string) { return this.change(this.db.from("expense_outings").delete().eq("id", id)); }

  /** Adds an outing and resolves with its id, so the expense being typed can be put in it at once. */
  async addOuting(bookId: string, title: string, happenedOn: string): Promise<string> {
    const { data, error } = await this.db.from("expense_outings").insert({ book_id: bookId, title: title.trim(), happened_on: happenedOn }).select("id").single();
    if (error) throw error;
    return data.id as string;
  }

  /** The last hundred changes to the book, newest first, with who made each. */
  async history(bookId: string): Promise<Change[]> {
    return ((await this.call("list_expense_history", { p_book_id: bookId })) ?? []).map((row: any): Change => ({
      id: row.id, operation: row.operation, kind: row.record_kind, at: row.changed_at, before: row.before, after: row.after, actorName: row.actor_name ?? "",
    }));
  }

  /** What the global search may find. An account that is in no book gets no rows, and no error. */
  async searchable(): Promise<{ note: string; amount: number; spentOn: string }[]> {
    const rows = await this.rows(this.db.from("expenses").select("note,amount,spent_on").order("spent_on", { ascending: false }).limit(300));
    return rows.map(row => ({ note: row.note, amount: Number(row.amount), spentOn: row.spent_on }));
  }
}

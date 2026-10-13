import { useQuery } from "@tanstack/react-query";
import { useSyncExternalStore } from "react";
import { useFeatures } from "../../../kernel/features";
import { useModule } from "../../../kernel/session";
import { createFeature, type BookSummary } from "../domain/Ledger";
import { expensesModule } from "../expenses.module";

/** The root of every ledger query. The server's "expenses" event, and every change made here, reload them. */
export const expensesKey = ["expenses"] as const;

const chosenKey = "gnouht-expense-book";
const listeners = new Set<() => void>();
/** The book the person opened last, kept on this device. All three screens of the ledger follow it. */
export const chosenBook = {
  get: () => { try { return localStorage.getItem(chosenKey) ?? ""; } catch { return ""; } },
  set(id: string) {
    try { localStorage.setItem(chosenKey, id); } catch { /* The choice then lasts until the page is left. */ }
    listeners.forEach(listener => listener());
  },
  subscribe(listener: () => void) { listeners.add(listener); return () => { listeners.delete(listener); }; },
};

/** The person's books: the ones they can open, the ones they are invited to, and the one that is open now. */
export function useBooks() {
  const repository = useModule(expensesModule);
  const features = useFeatures();
  const mayCreate = features.has(createFeature);
  const list = useQuery({ queryKey: [...expensesKey, "books", mayCreate], queryFn: () => repository.books(mayCreate), enabled: features.ready });
  const wanted = useSyncExternalStore(chosenBook.subscribe, chosenBook.get);
  const open = (list.data ?? []).filter(book => book.status === "active");
  const book: BookSummary | undefined = open.find(item => item.id === wanted) ?? open[0];
  return { list, mayCreate, open, invitations: (list.data ?? []).filter(item => item.status === "invited"), book };
}

/** The whole of the book that is open now. */
export function useLedger() {
  const repository = useModule(expensesModule);
  const { book } = useBooks();
  return useQuery({ queryKey: [...expensesKey, "ledger", book?.id, book?.role, book?.memberCount], queryFn: () => repository.load(book!), enabled: !!book });
}

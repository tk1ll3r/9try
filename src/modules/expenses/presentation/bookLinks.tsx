import { useQuery } from "@tanstack/react-query";
import { Wallet } from "lucide-react";
import { Link } from "react-router-dom";
import { useFeatures } from "../../../kernel/features";
import { useModule } from "../../../kernel/session";
import { ledgerFeature } from "../domain/Ledger";
import { expensesModule } from "../expenses.module";
import { expensesKey } from "./useLedger";
import { t } from "../../../kernel/i18n";

/** The books the person is in, for the screens of other features. An account that has no book to open asks the server nothing. */
function useListedBooks() {
  const repository = useModule(expensesModule);
  const features = useFeatures();
  return useQuery({ queryKey: [...expensesKey, "books", false], queryFn: () => repository.books(false), enabled: features.has(ledgerFeature) }).data ?? [];
}

/** On a group's page: the way to the group's expense book, for a member who is in it. A group without a book shows nothing. */
export function GroupBookLink({ groupId }: { groupId: string }) {
  const book = useListedBooks().find(item => item.groupId === groupId && item.status === "active");
  if (!book) return null;
  return <Link to={`/expenses/${book.id}`} className="inline-flex min-h-11 items-center gap-2 rounded-2xl bg-[var(--soft)] px-4 text-sm font-semibold"><Wallet size={17} /> {t("Sổ chi tiêu của nhóm")}</Link>;
}

/** Where an account is deleted: the books it owns go with it, for everyone in them. Said only to someone who shares a book they own. */
export function OwnedBooksWarning() {
  const shared = useListedBooks().filter(book => book.role === "owner" && book.memberCount > 1);
  if (!shared.length) return null;
  return <p className="mt-2 rounded-2xl bg-[var(--soft)] p-3 text-sm leading-6">
    {t("Bạn là chủ của sổ chi tiêu {0}. Xóa tài khoản sẽ xóa sổ ấy với mọi người đang dùng chung. Hãy tải tệp CSV trước nếu cần giữ lại.", shared.map(book => `“${book.name}”`).join(", "))}{" "}
    <Link to="/expenses/settings" className="font-semibold underline underline-offset-2">{t("Mở Sổ và lịch sử")}</Link>
  </p>;
}

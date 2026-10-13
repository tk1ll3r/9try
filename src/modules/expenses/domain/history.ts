import type { Change } from "./Ledger";
import { t } from "../../../kernel/i18n";

/**
 * One line of the book's history in words: "Sửa khoản chi: 600.000 ₫ → 650.000 ₫ · Ăn tối".
 * `money` writes an amount in the book's currency.
 */
export function describeChange(change: Change, money: (amount: number) => string): string {
  const row = change.after ?? change.before ?? {};
  const text = (key: string, from = row) => String(from[key] ?? "");
  const amount = (from: Record<string, unknown> | null) => money(Number(from?.amount ?? 0));
  const noted = (sentence: string) => text("note") ? `${sentence} · ${text("note")}` : sentence;
  const renamed = (key: string) => change.before && change.after && text(key, change.before) !== text(key, change.after);

  if (change.kind === "expenses") {
    if (change.operation === "insert") return noted(t("Thêm khoản chi {0}", amount(change.after)));
    if (change.operation === "delete") return noted(t("Xóa khoản chi {0}", amount(change.before)));
    return noted(change.before?.amount === change.after?.amount ? t("Sửa khoản chi {0}", amount(change.after)) : t("Sửa khoản chi: {0} → {1}", amount(change.before), amount(change.after)));
  }
  if (change.kind === "expense_settlements") {
    return change.operation === "insert" ? t("Ghi nhận trả lại {0}", amount(change.after))
      : change.operation === "delete" ? t("Xóa lần trả lại {0}", amount(change.before)) : t("Sửa lần trả lại: {0} → {1}", amount(change.before), amount(change.after));
  }
  if (change.kind === "expense_participants") {
    return renamed("display_name") ? t("Đổi tên {0} thành {1}", text("display_name", change.before!), text("display_name")) : t("Thêm {0} vào sổ", text("display_name"));
  }
  if (change.kind === "expense_categories") {
    return change.operation === "insert" ? t("Thêm hạng mục {0}", text("name")) : change.operation === "delete" ? t("Xóa hạng mục {0}", text("name")) : t("Sửa hạng mục {0}", text("name"));
  }
  if (change.kind === "expense_outings") {
    return change.operation === "insert" ? t("Thêm chuyến đi {0}", text("title")) : change.operation === "delete" ? t("Xóa chuyến đi {0}", text("title")) : t("Sửa chuyến đi {0}", text("title"));
  }
  return t("Đổi cài đặt của sổ");
}

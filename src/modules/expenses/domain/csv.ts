import type { Ledger } from "./Ledger";
import { t } from "../../../kernel/i18n";

/**
 * One cell. A text with a comma, a quote or a line break goes in quotes. A text that a spreadsheet
 * would run as a formula (it starts with =, +, - or @) gets an apostrophe in front, so that a note
 * typed into the book cannot do anything when the file is opened.
 */
function cell(value: string | number): string {
  const text = typeof value === "number" ? String(value) : /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
  return /[",\n\r]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
}

/**
 * The whole book as a table: one line for each expense and each repayment, newest first, with each
 * person's part in a column of its own. Amounts are plain numbers. The first character tells Excel
 * that the file is UTF-8, so Vietnamese letters come out right.
 */
export function toCsv(ledger: Ledger): string {
  const people = ledger.book.participants;
  const name = (id: string) => people.find(person => person.id === id)?.name ?? "";
  const header = [t("Loại"), t("Ngày"), t("Số tiền"), t("Người trả"), t("Người nhận"), t("Hạng mục"), t("Chuyến đi"), t("Ghi chú"), ...people.map(person => t("Phần của {0}", person.name))];
  const rows: [day: string, cells: (string | number)[]][] = [
    ...ledger.expenses.map(expense => [expense.spentOn, [
      t("Chi tiêu"), expense.spentOn, expense.amount, name(expense.payerId), "",
      ledger.book.categories.find(category => category.id === expense.categoryId)?.name ?? "",
      ledger.book.outings.find(outing => outing.id === expense.outingId)?.title ?? "", expense.note,
      ...people.map(person => expense.splits.find(part => part.participantId === person.id)?.amount ?? 0),
    ]] as [string, (string | number)[]]),
    ...ledger.settlements.map(paid => [paid.settledOn, [t("Trả lại"), paid.settledOn, paid.amount, name(paid.fromId), name(paid.toId), "", "", paid.note, ...people.map(() => "")]] as [string, (string | number)[]]),
  ];
  rows.sort((a, b) => b[0].localeCompare(a[0]));
  return "﻿" + [header, ...rows.map(row => row[1])].map(line => line.map(cell).join(",")).join("\r\n") + "\r\n";
}

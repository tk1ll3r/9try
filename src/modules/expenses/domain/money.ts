import { locale } from "../../../kernel/i18n";

/** The most one entry may hold. The database has the same limit. */
export const maxAmount = 1_000_000_000_000;

/**
 * An amount as people type it, in whole units of the currency: "600000", "600.000", "600k",
 * "1,5tr", "1tr2" (one million two hundred thousand). Null when the text is not an amount. A plain
 * "1.5" is not one: the đồng has no smaller unit, and guessing between 1.5 and 1,500 would be wrong
 * half the time.
 */
export function parseAmount(text: string): number | null {
  const typed = text.trim().toLowerCase().replace(/\s+/g, "").replace(/(₫|đ|vnd|vnđ)$/, "");
  const decimal = (whole: string, part?: string) => Number(`${whole}.${part ?? "0"}`);
  let amount: number;
  let found: RegExpExecArray | null;
  if (/^\d+$/.test(typed)) amount = Number(typed);
  else if (/^\d{1,3}([.,]\d{3})+$/.test(typed)) amount = Number(typed.replace(/[.,]/g, ""));
  else if ((found = /^(\d+)(?:[.,](\d+))?(?:k|n|nghìn|ngàn)$/.exec(typed))) amount = decimal(found[1], found[2]) * 1_000;
  // "1tr2": the digits after "tr" are the next places down, as people say them.
  else if ((found = /^(\d+)(?:tr|triệu|m)(\d{1,3})$/.exec(typed))) amount = Number(found[1]) * 1_000_000 + Number(found[2].padEnd(3, "0")) * 1_000;
  else if ((found = /^(\d+)(?:[.,](\d+))?(?:tr|triệu|m)$/.exec(typed))) amount = decimal(found[1], found[2]) * 1_000_000;
  else return null;
  amount = Math.round(amount);
  return amount > 0 && amount <= maxAmount ? amount : null;
}

/** "600.000 ₫" */
export function formatMoney(amount: number, currency = "VND"): string {
  return new Intl.NumberFormat(locale, { style: "currency", currency, maximumFractionDigits: 0 }).format(amount);
}

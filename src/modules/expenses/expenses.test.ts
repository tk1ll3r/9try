import { describe, expect, it } from "vitest";
import { toCsv } from "./domain/csv";
import { balances, canChange, canWrite, debt, divisionOf, filterExpenses, settleUp, splitEvenly, splitModeOf, splitOnPayer, splitProblem, totals, type Expense, type Ledger } from "./domain/Ledger";
import { formatMoney, parseAmount } from "./domain/money";

const me = { id: "me", name: "Tôi", label: "Tôi", isMe: true, userId: "u-me" }, partner = { id: "partner", name: "Linh", label: "Người ấy", isMe: false, userId: null };
const people = [me.id, partner.id];
const book = { id: "b", name: "Chi tiêu chung", role: "owner" as const, memberCount: 1, groupName: null, currency: "VND", defaultSplit: "equal" as const, participants: [me, partner],
  categories: [{ id: "food", name: "Ăn uống", icon: "food" }, { id: "move", name: "Đi lại", icon: "transport" }], outings: [{ id: "dalat", title: "Đà Lạt", happenedOn: "2026-10-03" }] };
let next = 0;
const spent = (amount: number, payerId: string, extra: Partial<Expense> = {}): Expense => ({
  id: `e${++next}`, amount, payerId, categoryId: null, outingId: null, spentOn: "2026-10-08", note: "", version: 1, createdBy: null, splits: splitEvenly(amount, people, payerId), ...extra,
});
// The example of the plan: the owner pays 600,000 for dinner, the partner 200,000 for transport, divided evenly.
const dinner = spent(600_000, "me", { categoryId: "food", note: "Ăn tối" });
const taxi = spent(200_000, "partner", { categoryId: "move", note: "Đi lại" });
const ledger = (expenses: Expense[], settlements: Ledger["settlements"] = []): Ledger => ({ book, expenses, settlements });

describe("who owes whom", () => {
  it("the plan's example: each one's part is 400,000 and the partner owes the owner 200,000", () => {
    const sums = totals([dinner, taxi]);
    expect(sums.total).toBe(800_000);
    expect([sums.shareOf.get("me"), sums.shareOf.get("partner")]).toEqual([400_000, 400_000]);
    expect([sums.paidBy.get("me"), sums.paidBy.get("partner")]).toEqual([600_000, 200_000]);
    expect(debt(ledger([dinner, taxi]))).toEqual({ fromId: "partner", toId: "me", amount: 200_000 });
  });
  it("a repayment clears the balance and adds nothing to what was spent", () => {
    const repaid = ledger([dinner, taxi], [{ id: "s1", fromId: "partner", toId: "me", amount: 200_000, settledOn: "2026-10-09", note: "", createdBy: null }]);
    expect(debt(repaid)).toBeNull();
    expect([...balances(repaid).values()]).toEqual([0, 0]);
    expect(totals(repaid.expenses).total).toBe(800_000);
  });
  it("a part repayment leaves the rest, and paying too much turns the debt around", () => {
    const half = [{ id: "s1", fromId: "partner", toId: "me", amount: 50_000, settledOn: "2026-10-09", note: "", createdBy: null }];
    expect(debt(ledger([dinner, taxi], half))).toEqual({ fromId: "partner", toId: "me", amount: 150_000 });
    const tooMuch = [{ id: "s1", fromId: "partner", toId: "me", amount: 250_000, settledOn: "2026-10-09", note: "", createdBy: null }];
    expect(debt(ledger([dinner, taxi], tooMuch))).toEqual({ fromId: "me", toId: "partner", amount: 50_000 });
  });
  it("an expense that is one person's alone changes nothing between them when that person paid, and all of it when the other did", () => {
    const mine = spent(90_000, "me", { splits: splitOnPayer(90_000, people, "me") });
    expect(debt(ledger([mine]))).toBeNull();
    const paidForMe = spent(90_000, "partner", { splits: [{ participantId: "me", amount: 90_000 }, { participantId: "partner", amount: 0 }] });
    expect(debt(ledger([paidForMe]))).toEqual({ fromId: "me", toId: "partner", amount: 90_000 });
  });
  it("a custom division counts each one's own part", () => {
    const gift = spent(100_000, "me", { splits: [{ participantId: "me", amount: 70_000 }, { participantId: "partner", amount: 30_000 }] });
    expect(debt(ledger([gift]))).toEqual({ fromId: "partner", toId: "me", amount: 30_000 });
  });
  it("editing an expense is the same as if it had been entered that way", () => {
    const edited = { ...dinner, amount: 650_000, splits: splitEvenly(650_000, people, "me") };
    expect(debt(ledger([edited, taxi]))).toEqual({ fromId: "partner", toId: "me", amount: 225_000 });
  });
});

describe("dividing an amount", () => {
  it("leaves the odd đồng with the one who paid, so the parts always add up", () => {
    expect(splitEvenly(100_001, people, "partner")).toEqual([{ participantId: "me", amount: 50_000 }, { participantId: "partner", amount: 50_001 }]);
    for (const amount of [1, 3, 999_999, 1_000_000]) expect(splitProblem(amount, splitEvenly(amount, people, "me"))).toBe("");
  });
  it("names the division of an expense, to open its form on the right choice", () => {
    expect(splitModeOf(dinner, people)).toBe("equal");
    expect(splitModeOf(spent(90_000, "me", { splits: splitOnPayer(90_000, people, "me") }), people)).toBe("payer");
    expect(splitModeOf(spent(100_000, "me", { splits: [{ participantId: "me", amount: 70_000 }, { participantId: "partner", amount: 30_000 }] }), people)).toBe("custom");
    // Between two, everything on the one who did not pay stays a custom division: there is nobody to leave out.
    expect(divisionOf(spent(100_000, "me", { splits: [{ participantId: "me", amount: 0 }, { participantId: "partner", amount: 100_000 }] }), people)).toEqual({ mode: "custom", sharers: people });
    // Among more, an even division between some of them is read back as one, with who shared.
    const three = ["me", "linh", "kha"];
    expect(divisionOf(spent(100_000, "me", { splits: splitEvenly(100_000, three, "me") }), three)).toEqual({ mode: "equal", sharers: three });
    expect(divisionOf(spent(90_001, "kha", { splits: [{ participantId: "me", amount: 45_001 }, { participantId: "linh", amount: 45_000 }, { participantId: "kha", amount: 0 }] }), three)).toEqual({ mode: "equal", sharers: ["me", "linh"] });
    expect(divisionOf(spent(90_000, "me", { splits: [{ participantId: "me", amount: 50_000 }, { participantId: "linh", amount: 40_000 }, { participantId: "kha", amount: 0 }] }), three).mode).toBe("custom");
    expect(divisionOf(spent(90_000, "me", { splits: splitOnPayer(90_000, three, "me") }), three).mode).toBe("payer");
  });
  it("refuses parts that do not add up, and negative ones", () => {
    expect(splitProblem(100_000, [{ participantId: "me", amount: 70_000 }, { participantId: "partner", amount: 20_000 }])).toMatch(/cộng lại/);
    expect(splitProblem(100_000, [{ participantId: "me", amount: 150_000 }, { participantId: "partner", amount: -50_000 }])).toMatch(/không âm/);
  });
});

describe("totals and filters", () => {
  const trip = spent(300_000, "partner", { spentOn: "2026-09-28", outingId: "dalat", categoryId: "food" });
  it("adds up by category, largest first, and by month, oldest first", () => {
    const sums = totals([dinner, taxi, trip]);
    expect(sums.byCategory).toEqual([["food", 900_000], ["move", 200_000]]);
    expect(sums.byMonth).toEqual([["2026-09", 300_000], ["2026-10", 800_000]]);
  });
  it("filters by day, category, payer and outing", () => {
    const all = [dinner, taxi, trip];
    expect(filterExpenses(all, { from: "2026-10-01" })).toEqual([dinner, taxi]);
    expect(filterExpenses(all, { to: "2026-09-30" })).toEqual([trip]);
    expect(filterExpenses(all, { categoryId: "food", payerId: "partner" })).toEqual([trip]);
    expect(filterExpenses(all, { outingId: "dalat" })).toEqual([trip]);
    expect(filterExpenses(all, {})).toEqual(all);
  });
});

describe("an amount as it is typed", () => {
  it("reads whole numbers, thousands separators and the usual short forms", () => {
    expect(["600000", "600.000", "600,000", "1.200.000", "600k", "600 K", "1,5tr", "1.5tr", "2 triệu", "1tr2", "1tr25", "35k đ", "35.000₫"].map(parseAmount))
      .toEqual([600_000, 600_000, 600_000, 1_200_000, 600_000, 600_000, 1_500_000, 1_500_000, 2_000_000, 1_200_000, 1_250_000, 35_000, 35_000]);
  });
  it("is nothing when it is not clearly an amount", () => {
    for (const text of ["", "abc", "1.5", "0", "-5", "12.34.5", "1e9", "99999999999999"]) expect(parseAmount(text)).toBeNull();
  });
  it("is written with the currency and no decimals", () => {
    expect(formatMoney(600_000).replace(/\s/g, " ")).toBe("600.000 ₫");
  });
});

describe("the book as a file", () => {
  it("has a line for each expense and repayment, newest first, with each one's part", () => {
    const csv = toCsv(ledger([dinner, taxi], [{ id: "s1", fromId: "partner", toId: "me", amount: 200_000, settledOn: "2026-10-09", note: "Chuyển khoản", createdBy: null }]));
    expect(csv.startsWith("﻿")).toBe(true);
    const lines = csv.slice(1).trimEnd().split("\r\n");
    expect(lines[0]).toBe("Loại,Ngày,Số tiền,Người trả,Người nhận,Hạng mục,Chuyến đi,Ghi chú,Phần của Tôi,Phần của Linh");
    expect(lines[1]).toBe("Trả lại,2026-10-09,200000,Linh,Tôi,,,Chuyển khoản,,");
    expect(lines.slice(2)).toEqual(["Chi tiêu,2026-10-08,600000,Tôi,,Ăn uống,,Ăn tối,300000,300000", "Chi tiêu,2026-10-08,200000,Linh,,Đi lại,,Đi lại,100000,100000"]);
  });
  it("quotes what would break a line, and disarms what a spreadsheet would run as a formula", () => {
    const tricky = spent(1_000, "me", { note: '=HYPERLINK("http://evil.example"), "xem"\nngay' });
    const csv = toCsv(ledger([tricky]));
    expect(csv).toContain(`"'=HYPERLINK(""http://evil.example""), ""xem""\nngay"`);
  });
});

describe("a book of several people", () => {
  const owed = (entries: [string, number][]) => new Map(entries);
  it("proposes the fewest repayments: whoever owes most pays whoever is owed most, until all are even", () => {
    // An paid for everything; the other three each owe a third of what is theirs.
    expect(settleUp(owed([["an", 90_000], ["binh", -30_000], ["chi", -30_000], ["dung", -30_000]]))).toEqual([
      { fromId: "binh", toId: "an", amount: 30_000 }, { fromId: "chi", toId: "an", amount: 30_000 }, { fromId: "dung", toId: "an", amount: 30_000 },
    ]);
    // Two are owed and two owe: three repayments, never more than one fewer than there are people.
    const payments = settleUp(owed([["an", 70_000], ["binh", 20_000], ["chi", -50_000], ["dung", -40_000]]));
    expect(payments).toHaveLength(3);
    const after = new Map([["an", 70_000], ["binh", 20_000], ["chi", -50_000], ["dung", -40_000]]);
    for (const payment of payments) { after.set(payment.fromId, after.get(payment.fromId)! + payment.amount); after.set(payment.toId, after.get(payment.toId)! - payment.amount); }
    expect([...after.values()]).toEqual([0, 0, 0, 0]);
    expect(settleUp(owed([["an", 0], ["binh", 0]]))).toEqual([]);
  });
  it("divides among the people named, and leaves the odd units with the first of them when the one who paid has no part", () => {
    expect(splitEvenly(100_000, ["an", "binh", "chi"], "binh")).toEqual([{ participantId: "an", amount: 33_333 }, { participantId: "binh", amount: 33_334 }, { participantId: "chi", amount: 33_333 }]);
    expect(splitEvenly(100_001, ["binh", "chi"], "an")).toEqual([{ participantId: "binh", amount: 50_001 }, { participantId: "chi", amount: 50_000 }]);
  });
  it("lets the owner change any entry, an editor their own, and a viewer none", () => {
    const byLinh = { createdBy: "u-linh" }, old = { createdBy: null };
    expect([canChange(byLinh, "u-me", "owner"), canChange(old, "u-me", "owner")]).toEqual([true, true]);
    expect([canChange(byLinh, "u-linh", "editor"), canChange(byLinh, "u-an", "editor"), canChange(old, "u-linh", "editor")]).toEqual([true, false, false]);
    expect([canChange(byLinh, "u-linh", "viewer"), canWrite("viewer"), canWrite("editor"), canWrite("owner")]).toEqual([false, false, true, true]);
  });
});

import { readFile } from "node:fs/promises";
import { expect, test, type Page } from "@playwright/test";
import { kha, signIn, user } from "./signedIn";

// Thursday 8 October 2026, 10:00, on the machine that runs the tests.
const now = new Date(2026, 9, 8, 10, 0);
const fits = (page: Page) => expect.poll(async () => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

interface Row { [key: string]: unknown }
interface Book {
  features: string[]; books: Row[]; members: Row[]; friends: Row[]; groups: Row[];
  expenses: Row[]; settlements: Row[]; outings: Row[]; categories: Row[]; participants: Row[]; history: Row[]; calls: { name: string; body: Row }[]; requests: string[]; failNextSave: boolean;
}
const linh = "33333333-3333-4333-8333-333333333333";
const summary = (id: string, name: string, more: Row = {}): Row => ({ id, name, role: "owner", status: "active", owner_name: "Vy", group_id: null, group_name: null, group_role: "editor", member_count: 1, invited_by_name: null, ...more });

/**
 * A server that keeps a ledger the way the database would, for an account that has the capability or
 * does not. A test changes `features`, `books`, `participants` and `members` before it opens a page,
 * to be an editor, a viewer or someone invited. Every book the account opens holds the same entries.
 */
async function ledgerServer(page: Page, granted: boolean): Promise<Book> {
  const book: Book = {
    features: ["couple_expenses", "expenses"], books: [summary("book-1", "Chi tiêu chung")], friends: [], groups: [],
    members: [{ user_id: user.id, display_name: "Vy", avatar_url: null, role: "owner", status: "active", participant_id: "p-me" }],
    expenses: [], settlements: [], outings: [], history: [], calls: [], requests: [], failNextSave: false,
    participants: [{ id: "p-me", display_name: "Tôi", linked_user_id: user.id, linked_name: "Vy", position: 0 }, { id: "p-partner", display_name: "Người ấy", linked_user_id: null, linked_name: null, position: 1 }],
    categories: [{ id: "c-food", name: "Ăn uống", icon: "food", position: 0 }, { id: "c-move", name: "Đi lại", icon: "transport", position: 1 }],
  };
  await page.route("**/rest/v1/**", route => {
    const request = route.request(); const url = new URL(request.url()); const path = url.pathname.replace(/^.*\/rest\/v1/, "");
    book.requests.push(`${request.method()} ${path}`);
    const id = url.searchParams.get("id")?.replace("eq.", "");
    if (path === "/rpc/my_features") return route.fulfill({ json: granted ? book.features : [] });
    if (path === "/rpc/list_friend_connections") return route.fulfill({ json: book.friends });
    if (path === "/group_memberships") return route.fulfill({ json: book.groups });
    // An account without the capability and without a book gets what the real server gives it: a refusal, and no rows.
    if (!granted) return path === "/rpc/open_expense_book" ? route.fulfill({ status: 400, json: { code: "P0001", message: "feature not granted" } }) : route.fulfill({ json: [] });
    if (path === "/rpc/list_expense_books") return route.fulfill({ json: book.books });
    if (path === "/rpc/open_expense_book") { book.books.push(summary("book-1", "Chi tiêu chung")); return route.fulfill({ json: "book-1" }); }
    if (path === "/expense_books") {
      if (request.method() === "PATCH") { book.calls.push({ name: "book", body: request.postDataJSON() }); return route.fulfill({ status: 204, body: "" }); }
      return route.fulfill({ json: book.books.filter(row => row.id === id).map(row => ({ id: row.id, name: row.name, currency: "VND", default_split: "equal" })) });
    }
    if (path === "/rpc/list_book_people") return route.fulfill({ json: book.participants });
    if (path === "/rpc/list_book_members") return route.fulfill({ json: book.members });
    if (path === "/expense_participants") { Object.assign(book.participants.find(row => row.id === id)!, request.postDataJSON()); book.calls.push({ name: "rename", body: request.postDataJSON() }); return route.fulfill({ status: 204, body: "" }); }
    if (path === "/expense_categories") {
      if (request.method() === "POST") { book.categories.push({ id: `c-${book.categories.length + 1}`, ...request.postDataJSON() }); book.calls.push({ name: "category", body: request.postDataJSON() }); return route.fulfill({ status: 201, body: "" }); }
      return route.fulfill({ json: book.categories });
    }
    if (path === "/expense_outings") {
      if (request.method() === "POST") { const made = { id: `o-${book.outings.length + 1}`, ...request.postDataJSON() }; book.outings.push(made); return route.fulfill({ status: 201, json: { id: made.id } }); }
      return route.fulfill({ json: book.outings });
    }
    if (path === "/expenses") return route.fulfill({ json: [...book.expenses].reverse() });
    if (path === "/expense_settlements") return route.fulfill({ json: [...book.settlements].reverse() });
    if (path === "/rpc/list_expense_history") return route.fulfill({ json: book.history });
    if (["/rpc/save_expense", "/rpc/delete_expense", "/rpc/save_settlement", "/rpc/delete_settlement"].includes(path)) {
      const body = request.postDataJSON(); const name = path.slice(5);
      if (name === "save_expense" && book.failNextSave) { book.failNextSave = false; return route.fulfill({ status: 400, json: { code: "P0001", message: "split does not add up" } }); }
      book.calls.push({ name, body });
      if (name === "save_expense") {
        const stored = { id: body.p_id ?? `e-${book.expenses.length + 1}`, amount: body.p_amount, payer_id: body.p_payer_id, category_id: body.p_category_id, outing_id: body.p_outing_id, spent_on: body.p_spent_on, note: body.p_note, expense_splits: body.p_splits };
        const old = book.expenses.find(row => row.id === body.p_id);
        if (old) Object.assign(old, stored, { version: Number(old.version) + 1 }); else book.expenses.push({ ...stored, version: 1, created_by: user.id });
      }
      if (name === "delete_expense") book.expenses = book.expenses.filter(row => row.id !== body.p_id);
      if (name === "save_settlement") book.settlements.push({ id: `s-${book.settlements.length + 1}`, from_participant_id: body.p_from_participant_id, to_participant_id: body.p_to_participant_id, amount: body.p_amount, settled_on: body.p_settled_on, note: body.p_note, created_by: user.id });
      return route.fulfill({ json: null });
    }
    // What the owner and the members do to who is in a book.
    if (/^\/rpc\/(create_expense_book|delete_expense_book|invite_to_book|answer_book_invite|set_book_member|remove_book_member|leave_expense_book)$/.test(path)) {
      const body = request.postDataJSON(); const name = path.slice(5);
      book.calls.push({ name, body });
      if (name === "create_expense_book") { const made = `book-${book.books.length + 1}`; book.books.push(summary(made, body.p_name, body.p_group_id ? { group_id: body.p_group_id, group_name: "Lớp 12A", group_role: body.p_group_role, member_count: 3 } : {})); return route.fulfill({ json: made }); }
      if (name === "answer_book_invite") book.books = body.p_accept ? book.books.map(row => row.id === body.p_book_id ? { ...row, status: "active", member_count: Number(row.member_count) + 1 } : row) : book.books.filter(row => row.id !== body.p_book_id);
      if (name === "invite_to_book") book.members.push({ user_id: body.p_user_id, display_name: String(book.friends.find(friend => friend.user_id === body.p_user_id)?.display_name), avatar_url: null, role: body.p_role, status: "invited", participant_id: body.p_participant_id });
      if (name === "set_book_member") Object.assign(book.members.find(row => row.user_id === body.p_user_id)!, { role: body.p_role });
      if (name === "remove_book_member") book.members = book.members.filter(row => row.user_id !== body.p_user_id);
      if (name === "leave_expense_book" || name === "delete_expense_book") { book.books = book.books.filter(row => row.id !== body.p_book_id); if (!book.books.length) book.features = book.features.filter(feature => feature !== "expenses"); }
      return route.fulfill({ json: null });
    }
    return route.fulfill({ json: [] });
  });
  return book;
}

test("expenses: an amount, who paid, and Save; then who owes whom, a repayment, a custom division, an edit and a filter", async ({ page }) => {
  await page.clock.setFixedTime(now);
  await signIn(page);
  const book = await ledgerServer(page, true);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/expenses");
  const add = page.locator("section").filter({ has: page.getByRole("heading", { name: "Thêm khoản chi" }) });
  const balance = page.locator("section").filter({ has: page.getByRole("heading", { name: "Ai nợ ai" }) }).getByRole("status");
  await expect(balance).toHaveText("Hai bạn không ai nợ ai.");
  await fits(page);

  // The short way: an amount as people type it, the payer already on "Tôi", one button.
  await add.getByLabel("Số tiền").fill("600k");
  await expect(add.locator("#amount-read")).toHaveText(/600\.000\s₫/);
  await expect(add.getByRole("button", { name: "Tôi trả" })).toHaveAttribute("aria-pressed", "true");
  await add.getByRole("button", { name: "Lưu khoản chi" }).click();
  await expect(page.getByText("Đã lưu khoản chi.")).toBeVisible();
  expect(book.calls[0]).toEqual({ name: "save_expense", body: { p_id: null, p_amount: 600000, p_payer_id: "p-me", p_spent_on: "2026-10-08", p_category_id: null, p_outing_id: null, p_note: "",
    p_splits: [{ participant_id: "p-me", amount: 300000 }, { participant_id: "p-partner", amount: 300000 }], p_version: null, p_book_id: "book-1" } });
  await expect(add.getByLabel("Số tiền")).toHaveValue("");

  // The plan's example: the partner pays 200,000 for transport, and owes the owner 200,000.
  await add.getByLabel("Số tiền").fill("200.000");
  await add.getByRole("button", { name: "Người ấy trả" }).click();
  await add.getByRole("button", { name: "Thêm chi tiết" }).click();
  await add.getByRole("button", { name: "Đi lại" }).click();
  await add.getByRole("button", { name: "Lưu khoản chi" }).click();
  await expect(balance).toHaveText(/Người ấy nợ bạn 200\.000\s₫/);
  await expect(page.getByRole("heading", { name: "Mọi khoản chi · 2" })).toBeVisible();

  // Paying back clears it, and the two expenses still add up to 800,000.
  await page.getByRole("button", { name: "Ghi nhận đã trả lại" }).click();
  await expect(page.getByLabel("Người ấy trả lại Tôi bao nhiêu?")).toHaveValue("200000");
  await page.getByRole("button", { name: "Lưu", exact: true }).click();
  await expect(balance).toHaveText("Hai bạn không ai nợ ai.");
  expect(book.calls.at(-1)).toEqual({ name: "save_settlement", body: { p_id: null, p_from_participant_id: "p-partner", p_to_participant_id: "p-me", p_amount: 200000, p_settled_on: "2026-10-08", p_note: "", p_book_id: "book-1" } });
  await expect(page.getByRole("region", { name: "Thứ năm, 8 tháng 10" }).getByText(/800\.000\s₫/)).toBeVisible();

  // A custom division: one part is typed, the other is what is left. Parts that cannot be are refused before anything is sent.
  await add.getByLabel("Số tiền").fill("100000");
  await add.getByRole("button", { name: "Tôi trả" }).click();
  // The form for the next expense starts short again; the details are one tap away.
  await add.getByRole("button", { name: "Thêm chi tiết" }).click();
  await add.getByRole("button", { name: "Tự chia" }).click();
  await add.getByLabel("Phần của Tôi").fill("150000");
  const sent = book.calls.length;
  await add.getByRole("button", { name: "Lưu khoản chi" }).click();
  await expect(add.getByRole("alert")).toHaveText("Mỗi phần phải là một số tiền không âm.");
  expect(book.calls).toHaveLength(sent);
  await add.getByLabel("Phần của Tôi").fill("70000");
  await expect(add.getByText(/Phần của Người ấy: 30\.000\s₫/)).toBeVisible();

  // The server refuses once: what was typed is still there, with the reason, and the next try goes through.
  book.failNextSave = true;
  await add.getByRole("button", { name: "Lưu khoản chi" }).click();
  await expect(add.getByRole("alert")).toHaveText("Các phần cộng lại phải bằng số tiền đã chi.");
  await expect(add.getByLabel("Số tiền")).toHaveValue("100000");
  await expect(add.getByLabel("Phần của Tôi")).toHaveValue("70000");
  await add.getByRole("button", { name: "Lưu khoản chi" }).click();
  await expect(balance).toHaveText(/Người ấy nợ bạn 30\.000\s₫/);
  expect(book.calls.at(-1)!.body.p_splits).toEqual([{ participant_id: "p-me", amount: 70000 }, { participant_id: "p-partner", amount: 30000 }]);

  // An entry opens to be changed, and the change says which version it started from.
  await page.getByRole("button", { name: /^Sửa khoản chi: Khoản chi, 600\.000/ }).click();
  const edit = page.getByRole("dialog", { name: "Sửa khoản chi" });
  await expect(edit.getByLabel("Số tiền")).toHaveValue("600000");
  await edit.getByLabel("Số tiền").fill("650000");
  await edit.getByLabel("Ghi chú (tùy chọn)").fill("Ăn tối");
  await edit.getByRole("button", { name: "Lưu thay đổi" }).click();
  await expect(edit).toHaveCount(0);
  expect(book.calls.at(-1)!.body).toMatchObject({ p_id: "e-1", p_amount: 650000, p_note: "Ăn tối", p_version: 1 });
  await expect(page.getByRole("button", { name: /^Sửa khoản chi: Ăn tối, 650\.000/ })).toBeVisible();

  // Filters narrow the list and say what the narrowed list adds up to. Removing asks first.
  await page.getByRole("group", { name: "Lọc khoản chi" }).getByLabel("Người trả").selectOption("p-partner");
  await expect(page.getByRole("heading", { name: /^Đang lọc · 1 khoản · 200\.000/ })).toBeVisible();
  await page.getByRole("button", { name: "Bỏ lọc" }).click();
  await page.getByLabel("Thao tác với khoản chi: Đi lại").click();
  await page.getByRole("button", { name: "Xóa", exact: true }).click();
  await page.getByRole("alertdialog", { name: "Xóa khoản chi?" }).getByRole("button", { name: "Xóa khoản chi" }).click();
  await expect(page.getByRole("heading", { name: "Mọi khoản chi · 2" })).toBeVisible();
  expect(book.calls.at(-1)).toEqual({ name: "delete_expense", body: { p_id: "e-2" } });
  await fits(page);
});

test("expenses: the numbers, the partner's name, the file and the history", async ({ page }) => {
  await page.clock.setFixedTime(now);
  await signIn(page);
  const book = await ledgerServer(page, true);
  book.expenses.push(
    { id: "e-1", amount: 600000, payer_id: "p-me", category_id: "c-food", outing_id: null, spent_on: "2026-10-08", note: "Ăn tối", version: 1, expense_splits: [{ participant_id: "p-me", amount: 300000 }, { participant_id: "p-partner", amount: 300000 }] },
    { id: "e-2", amount: 200000, payer_id: "p-partner", category_id: "c-move", outing_id: null, spent_on: "2026-10-07", note: "", version: 1, expense_splits: [{ participant_id: "p-me", amount: 100000 }, { participant_id: "p-partner", amount: 100000 }] },
    { id: "e-3", amount: 90000, payer_id: "p-me", category_id: null, outing_id: null, spent_on: "2026-08-20", note: "Sách", version: 1, expense_splits: [{ participant_id: "p-me", amount: 90000 }, { participant_id: "p-partner", amount: 0 }] },
  );
  book.history.push(
    { id: 2, operation: "update", record_kind: "expenses", changed_at: "2026-10-08T02:30:00Z", before: { amount: 550000, note: "Ăn tối" }, after: { amount: 600000, note: "Ăn tối" } },
    { id: 1, operation: "insert", record_kind: "expenses", changed_at: "2026-10-08T02:00:00Z", before: null, after: { amount: 550000, note: "Ăn tối" } },
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/expenses");
  // The ledger's own screens are tabs of it.
  const tabs = page.getByRole("navigation", { name: "Trong màn này" });
  await expect(tabs.getByRole("link")).toHaveText(["Chi tiêu", "Thống kê chi tiêu", "Sổ và lịch sử"]);

  await tabs.getByRole("link", { name: "Thống kê chi tiêu" }).click();
  const spent = page.locator("section").filter({ has: page.getByRole("heading", { name: "Đã chi" }) });
  // This month: the two expenses of October. The one from August is outside.
  await expect(spent).toContainText(/800\.000\s₫/);
  await expect(spent).toContainText(/Tôi đã trả/);
  const categories = page.locator("section").filter({ has: page.getByRole("heading", { name: "Theo hạng mục" }) }).getByRole("listitem");
  await expect(categories).toHaveText([/Ăn uống.*600\.000/, /Đi lại.*200\.000/]);
  await page.getByRole("group", { name: "Khoảng thời gian" }).getByRole("button", { name: "Tất cả" }).click();
  await expect(spent).toContainText(/890\.000\s₫/);
  await expect(categories).toHaveText([/Ăn uống.*600\.000/, /Đi lại.*200\.000/, /Chưa xếp hạng mục.*90\.000/]);
  await expect(page.getByRole("list", { name: "Chi tiêu theo tháng" }).getByRole("listitem")).toHaveCount(12);
  await fits(page);

  await tabs.getByRole("link", { name: "Sổ và lịch sử" }).click();
  // The partner is a name; renaming them changes that name and nothing else.
  await page.getByLabel("Tên người ấy").fill("Linh");
  await page.getByRole("button", { name: "Lưu", exact: true }).click();
  await expect(page.getByRole("status")).toHaveText("Đã lưu.");
  expect(book.calls).toEqual([{ name: "rename", body: { display_name: "Linh" } }]);

  // The file has a line for each entry, with amounts as plain numbers. The new name is on the screen a
  // moment after "Đã lưu." is, so the file is asked for until it has it.
  let lines: string[] = [];
  await expect(async () => {
    const waiting = page.waitForEvent("download");
    await page.getByRole("button", { name: "Tải tệp CSV" }).click();
    const file = await waiting;
    expect(file.suggestedFilename()).toMatch(/^gnouht-chi-tieu-\d{4}-\d{2}-\d{2}\.csv$/);
    lines = (await readFile(await file.path(), "utf8")).replace(/^\uFEFF/, "").trimEnd().split("\r\n");
    expect(lines[0]).toBe("Loại,Ngày,Số tiền,Người trả,Người nhận,Hạng mục,Chuyến đi,Ghi chú,Phần của Tôi,Phần của Linh");
  }).toPass({ timeout: 10_000 });
  expect(lines[1]).toBe("Chi tiêu,2026-10-08,600000,Tôi,,Ăn uống,,Ăn tối,300000,300000");
  expect(lines).toHaveLength(4);

  // The history says what changed, newest first.
  const history = page.locator("section").filter({ has: page.getByRole("heading", { name: "Lịch sử chỉnh sửa" }) }).getByRole("listitem");
  await expect(history).toHaveText([/Sửa khoản chi: 550\.000\s₫ → 600\.000\s₫ · Ăn tối/, /Thêm khoản chi 550\.000\s₫ · Ăn tối/]);
  await fits(page);
});

test("expenses: an account without the capability finds no trace of the ledger", async ({ page }) => {
  await signIn(page);
  const book = await ledgerServer(page, false);
  await page.goto("/");
  // Not in the sidebar, not in the Menu, not in the shortcuts to choose from, not in the search.
  const sidebar = page.getByRole("complementary").getByRole("navigation", { name: "Điều hướng chính" });
  await expect(sidebar.getByRole("link", { name: "Thống kê" })).toBeVisible();
  await expect(sidebar.getByRole("link", { name: "Chi tiêu" })).toHaveCount(0);
  await page.goto("/menu");
  await expect(page.getByRole("region", { name: "Của bạn" }).getByRole("link")).toHaveText(["Thống kê"]);
  await page.goto("/today");
  await page.locator("section").filter({ has: page.getByRole("heading", { name: "Lối tắt" }) }).getByRole("button", { name: "Sửa" }).click();
  await expect(page.getByRole("button", { name: "Thống kê", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: /Chi tiêu|Sổ và lịch sử/ })).toHaveCount(0);
  await page.keyboard.press("Control+k");
  await page.getByLabel("Từ khóa").fill("chi tieu");
  await expect(page.getByText("Không thấy gì khớp.")).toBeVisible();
  await page.keyboard.press("Escape");

  // The addresses lead home, as an address that does not exist does, and nothing of a ledger is asked for.
  for (const path of ["/expenses", "/expenses/stats", "/expenses/settings"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/$/);
    await expect(page.getByRole("heading", { name: "Mọi người đang làm gì?" })).toBeVisible();
  }
  for (const path of ["/groups/g-1", "/me/settings"]) { await page.goto(path); await expect(page.getByRole("main").getByRole("heading").first()).toBeVisible(); }
  expect(book.requests.filter(request => /open_expense_book|expense_books|list_book|expense_participants|save_expense/.test(request))).toEqual([]);
});

test("expenses stay out of product navigation even for an account with the dormant capability", async ({ page }) => {
  await signIn(page);
  const book = await ledgerServer(page, true);
  await page.goto("/");
  const sidebar = page.getByRole("complementary").getByRole("navigation", { name: "Điều hướng chính" });
  await expect(sidebar.getByRole("link")).toHaveText(["Mode", "Lịch", "Trò chuyện", "Quan hệ", "Thói quen", "Ghi chú", "Nhóm", "Góp ý admin", "Menu"]);
  await page.goto("/menu");
  await expect(page.getByRole("region", { name: "Của bạn" })).toHaveCount(0);
  await expect(page.getByText("Chi tiêu", { exact: true })).toHaveCount(0);
  await page.getByRole("complementary").getByRole("button", { name: "Tìm kiếm" }).click();
  await page.getByLabel("Từ khóa").fill("chi tieu");
  await expect(page.getByText("Không thấy gì khớp.")).toBeVisible();
  expect(book.requests.filter(request => /open_expense_book|expense_books|list_book|expense_participants|save_expense/.test(request))).toEqual([]);
});

const friend = (id: string, name: string): Row => ({ user_id: id, display_name: name, username: name.toLowerCase(), avatar_url: null, status: "accepted", direction: "incoming", created_at: "2026-01-01T00:00:00Z" });
const member = (id: string, name: string, role: string, participant: string, status = "active"): Row => ({ user_id: id, display_name: name, avatar_url: null, role, status, participant_id: participant });
const person = (id: string, label: string, account: string | null = null, name: string | null = null, position = 0): Row => ({ id, display_name: label, linked_user_id: account, linked_name: name, position });
const spent = (id: string, amount: number, payer: string, by: string, note: string, parts: [string, number][]): Row => ({ id, amount, payer_id: payer, category_id: null, outing_id: null, spent_on: "2026-10-08", note, version: 1, created_by: by, expense_splits: parts.map(([participant_id, part]) => ({ participant_id, amount: part })) });

/** Vy as someone Linh let into her book "Hai đứa": the name "Người ấy" now stands for Vy's account. */
function asMemberOfLinhsBook(book: Book, role: "editor" | "viewer") {
  book.features = ["expenses"];
  book.books = [summary("book-2", "Hai đứa", { role, owner_name: "Linh", member_count: 2 })];
  book.participants = [person("p-linh", "Tôi", linh, "Linh"), person("p-me", "Người ấy", user.id, "Vy", 1)];
  book.members = [member(linh, "Linh", "owner", "p-linh"), member(user.id, "Vy", role, "p-me")];
  book.expenses.push(spent("e-1", 400000, "p-linh", linh, "Siêu thị", [["p-linh", 200000], ["p-me", 200000]]), spent("e-2", 100000, "p-me", user.id, "Trà sữa", [["p-linh", 50000], ["p-me", 50000]]));
}

test("expenses, as an editor of someone's book: adds an entry to that book, changes only their own, and may leave but not manage", async ({ page }) => {
  await page.clock.setFixedTime(now);
  await signIn(page);
  const book = await ledgerServer(page, true);
  asMemberOfLinhsBook(book, "editor");
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/expenses");
  await expect(page.getByText("Hai đứa · 2 người cùng dùng · bạn là được nhập")).toBeVisible();
  // The other account goes by its own name, and the reader is "Tôi" whatever the owner called them.
  const balance = page.locator("section").filter({ has: page.getByRole("heading", { name: "Ai nợ ai" }) }).getByRole("status");
  await expect(balance).toHaveText(/Bạn nợ Linh 150\.000\s₫/);
  await expect(page.getByRole("button", { name: "Tạo sổ mới" })).toHaveCount(0);

  const add = page.locator("section").filter({ has: page.getByRole("heading", { name: "Thêm khoản chi" }) });
  await expect(add.getByRole("group", { name: "Ai trả?" }).getByRole("button")).toHaveText(["Linh trả", "Tôi trả"]);
  await expect(add.getByRole("button", { name: "Tôi trả" })).toHaveAttribute("aria-pressed", "true");
  await add.getByLabel("Số tiền").fill("60k");
  await add.getByRole("button", { name: "Lưu khoản chi" }).click();
  await expect(page.getByText("Đã lưu khoản chi.")).toBeVisible();
  expect(book.calls.at(-1)).toEqual({ name: "save_expense", body: { p_id: null, p_amount: 60000, p_payer_id: "p-me", p_spent_on: "2026-10-08", p_category_id: null, p_outing_id: null, p_note: "",
    p_splits: [{ participant_id: "p-linh", amount: 30000 }, { participant_id: "p-me", amount: 30000 }], p_version: null, p_book_id: "book-2" } });

  // Their own entry opens to be changed. The owner's is there to read, with nothing to press.
  await expect(page.getByRole("button", { name: /^Sửa khoản chi: Trà sữa, 100\.000/ })).toBeVisible();
  await expect(page.getByText("Siêu thị")).toBeVisible();
  await expect(page.getByRole("button", { name: /Siêu thị/ })).toHaveCount(0);
  await fits(page);

  await page.getByRole("navigation", { name: "Trong màn này" }).getByRole("link", { name: "Sổ và lịch sử" }).click();
  const people = page.locator("section").filter({ has: page.getByRole("heading", { name: "Người dùng chung sổ · 2" }) });
  await expect(people.getByRole("listitem")).toHaveText([/Linh.*chủ sổ/, /Bạn.*được nhập/]);
  await expect(people.getByText("Mời một người bạn vào sổ")).toHaveCount(0);
  await expect(people.getByRole("combobox")).toHaveCount(0);
  await expect(page.getByText("Tên trong sổ và cách chia do chủ sổ đặt.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Xóa sổ này" })).toHaveCount(0);
  // The small lists are an editor's to add to.
  await page.getByLabel("Tên hạng mục mới").fill("Cà phê");
  await page.getByRole("button", { name: "Thêm hạng mục" }).click();
  await expect(page.getByText("Đã thêm hạng mục.")).toBeVisible();
  expect(book.calls.at(-1)).toEqual({ name: "category", body: { book_id: "book-2", name: "Cà phê", icon: "other", position: 2 } });
  await fits(page);

  // Leaving takes the ledger out of the app for someone who has no other book.
  await people.getByRole("button", { name: "Rời sổ" }).click();
  await page.getByRole("alertdialog", { name: "Rời sổ này?" }).getByRole("button", { name: "Rời sổ" }).click();
  await expect(page.getByRole("heading", { name: "Mọi người đang làm gì?" })).toBeVisible();
  expect(book.calls.at(-1)).toEqual({ name: "leave_expense_book", body: { p_book_id: "book-2" } });
});

test("expenses, as a viewer of a group's book: every number is there to read, and nothing to add, change or record", async ({ page }) => {
  await page.clock.setFixedTime(now);
  await signIn(page);
  const book = await ledgerServer(page, true);
  book.features = ["expenses"];
  book.books = [summary("book-4", "Quỹ lớp", { role: "viewer", owner_name: "Linh", group_id: "g-1", group_name: "Lớp 12A", group_role: "viewer", member_count: 3 })];
  book.groups = [{ role: "member", group: { id: "g-1", name: "Lớp 12A", description: "", member_count: 3, archived_at: null } }];
  book.participants = [person("p-linh", "Tôi", linh, "Linh"), person("p-me", "Vy", user.id, "Vy", 1), person("p-kha", "Kha", kha, "Kha", 2)];
  book.members = [member(linh, "Linh", "owner", "p-linh"), member(user.id, "Vy", "viewer", "p-me"), member(kha, "Kha", "viewer", "p-kha")];
  book.expenses.push(spent("e-1", 300000, "p-linh", linh, "Liên hoan", [["p-linh", 100000], ["p-me", 100000], ["p-kha", 100000]]));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/expenses");
  await expect(page.getByText("Quỹ lớp · Lớp 12A · 3 người cùng dùng · bạn là chỉ xem")).toBeVisible();
  await expect(page.getByText("Bạn xem được sổ này. Việc nhập khoản chi là của chủ sổ và những người được nhập.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Thêm khoản chi" })).toHaveCount(0);

  // More than two people: what each is owed or owes, and the fewest repayments that settle it.
  const balance = page.locator("section").filter({ has: page.getByRole("heading", { name: "Ai nợ ai" }) });
  await expect(balance.getByRole("status")).toHaveText("Còn 2 khoản cần trả lại để mọi người hết nợ nhau.");
  await expect(balance.getByRole("list", { name: "Mỗi người đang được nhận hay đang nợ" }).getByRole("listitem")).toHaveText([/Linh.*được nhận 200\.000\s₫/, /Tôi.*nợ 100\.000\s₫/, /Kha.*nợ 100\.000\s₫/]);
  await expect(balance.getByRole("list", { name: "Cách trả lại gọn nhất" }).getByRole("listitem")).toHaveText([/Tôi trả Linh 100\.000\s₫/, /Kha trả Linh 100\.000\s₫/]);
  await expect(balance.getByRole("button")).toHaveCount(0);
  await expect(page.getByText("Liên hoan")).toBeVisible();
  await expect(page.getByRole("button", { name: /Liên hoan/ })).toHaveCount(0);
  await fits(page);

  const tabs = page.getByRole("navigation", { name: "Trong màn này" });
  await tabs.getByRole("link", { name: "Thống kê chi tiêu" }).click();
  await expect(page.locator("section").filter({ has: page.getByRole("heading", { name: "Đã chi" }) })).toContainText(/300\.000\s₫/);
  await expect(page.getByRole("heading", { name: "Ai nợ ai" })).toBeVisible();
  await fits(page);

  await tabs.getByRole("link", { name: "Sổ và lịch sử" }).click();
  await expect(page.getByText("Đây là sổ của nhóm Lớp 12A. Thành viên của nhóm tự có mặt trong sổ; ai rời nhóm thì rời sổ.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Thêm hạng mục" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: /^Xóa hạng mục/ })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Tải tệp CSV" })).toBeVisible();
  await fits(page);
  expect(book.calls).toEqual([]);

  // The group's own page leads to its book. Someone who owns no shared book is told nothing where an account is deleted.
  await page.goto("/groups/g-1");
  await page.getByRole("link", { name: "Sổ chi tiêu của nhóm" }).click();
  await expect(page).toHaveURL(/\/expenses$/);
  await expect(page.getByText("Quỹ lớp · Lớp 12A · 3 người cùng dùng · bạn là chỉ xem")).toBeVisible();
  await page.goto("/me/settings");
  await expect(page.getByText("Xóa tài khoản", { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/Bạn là chủ của sổ chi tiêu/)).toHaveCount(0);
});

test("expenses: an invitation is declined or accepted, and an accepted book opens", async ({ page }) => {
  await page.clock.setFixedTime(now);
  await signIn(page);
  const book = await ledgerServer(page, true);
  asMemberOfLinhsBook(book, "editor");
  book.books = [summary("book-2", "Hai đứa", { role: "editor", status: "invited", owner_name: "Linh", invited_by_name: "Linh", member_count: 1 }), summary("book-5", "Chuyến Đà Lạt", { role: "viewer", status: "invited", owner_name: "Kha", invited_by_name: "Kha", member_count: 4 })];
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/expenses");
  const mine = page.getByRole("region", { name: "Sổ của bạn" });
  await expect(mine.getByText("Linh mời bạn vào sổ “Hai đứa”.")).toBeVisible();
  await expect(mine.getByText("Bạn sẽ xem và nhập được khoản chi trong sổ.")).toBeVisible();
  await expect(mine.getByText("Kha mời bạn vào sổ “Chuyến Đà Lạt”.")).toBeVisible();
  await expect(mine.getByText("Bạn sẽ xem được mọi khoản chi trong sổ.")).toBeVisible();
  await expect(page.getByText("Trả lời lời mời ở trên để mở sổ.")).toBeVisible();
  // Nothing of a book is read before the person is in it.
  expect(book.requests.filter(request => /list_book_people|\/expenses$|expense_settlements/.test(request))).toEqual([]);
  await fits(page);

  await mine.getByRole("button", { name: "Từ chối" }).nth(1).click();
  await expect(mine.getByText("Kha mời bạn vào sổ “Chuyến Đà Lạt”.")).toHaveCount(0);
  expect(book.calls.at(-1)).toEqual({ name: "answer_book_invite", body: { p_book_id: "book-5", p_accept: false } });

  await mine.getByRole("button", { name: "Vào sổ" }).click();
  await expect(page.getByText("Hai đứa · 2 người cùng dùng · bạn là được nhập")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Thêm khoản chi" })).toBeVisible();
  expect(book.calls.at(-1)).toEqual({ name: "answer_book_invite", body: { p_book_id: "book-2", p_accept: true } });
  await expect(mine).toHaveCount(0);
});

test("expenses, as the owner: a friend is invited to stand behind a name, gets a role and is taken out; a second book is made for a group, opened and deleted", async ({ page }) => {
  await page.clock.setFixedTime(now);
  await signIn(page);
  const book = await ledgerServer(page, true);
  book.friends = [friend(kha, "Kha"), friend(linh, "Linh")];
  book.groups = [{ role: "member", group: { id: "g-1", name: "Lớp 12A", description: "", member_count: 3, archived_at: null } }];
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/expenses/settings");
  await expect(page.getByText("Sổ riêng của bạn · chỉ mình bạn xem được")).toBeVisible();
  const people = page.locator("section").filter({ has: page.getByRole("heading", { name: /^Người dùng chung sổ/ }) });

  // The friend takes over "Người ấy", so what that name paid so far becomes theirs.
  await people.getByLabel("Người được mời").selectOption(kha);
  await people.getByLabel("Là ai trong sổ?").selectOption({ label: "Chính là “Người ấy”" });
  await expect(people.getByText("Những khoản mà tên này đã trả và đã nợ từ trước sẽ là của người được mời.")).toBeVisible();
  await people.getByRole("button", { name: "Gửi lời mời" }).click();
  await expect(people.getByRole("status")).toHaveText("Đã gửi lời mời. Người ấy thấy sổ sau khi đồng ý.");
  expect(book.calls.at(-1)).toEqual({ name: "invite_to_book", body: { p_book_id: "book-1", p_user_id: kha, p_role: "editor", p_participant_id: "p-partner" } });
  await expect(people.getByRole("listitem")).toHaveText([/Bạn.*chủ sổ/, /Kha.*đã mời, chưa trả lời/]);
  // Someone who is invited is no longer offered, and neither is the name they will take.
  await expect(people.getByLabel("Người được mời").getByRole("option")).toHaveText(["Chọn bạn", "Linh"]);
  await expect(people.getByLabel("Là ai trong sổ?").getByRole("option")).toHaveText(["Một tên mới"]);
  await fits(page);

  // An invitation is withdrawn without a question. Someone who is in the book gets a role, and is asked about before they are taken out.
  await people.getByRole("button", { name: "Rút lời mời Kha" }).click();
  await expect(people.getByRole("listitem")).toHaveCount(1);
  expect(book.calls.at(-1)).toEqual({ name: "remove_book_member", body: { p_book_id: "book-1", p_user_id: kha } });
  book.members.push(member(linh, "Linh", "editor", "p-partner"));
  await page.reload();
  // On a phone the role is on a line of its own, under the name it belongs to.
  const row = people.getByRole("listitem").nth(1);
  const [nameBox, roleBox] = [await row.getByText("Linh", { exact: true }).boundingBox(), await row.getByRole("combobox").boundingBox()];
  expect(nameBox!.y + nameBox!.height).toBeLessThanOrEqual(roleBox!.y);
  await people.getByLabel("Quyền của Linh").selectOption("viewer");
  await expect(people.getByRole("listitem").nth(1)).toContainText("chỉ xem");
  expect(book.calls.at(-1)).toEqual({ name: "set_book_member", body: { p_book_id: "book-1", p_user_id: linh, p_role: "viewer" } });
  await people.getByRole("button", { name: "Đưa Linh ra khỏi sổ" }).click();
  await page.getByRole("alertdialog", { name: "Đưa Linh ra khỏi sổ?" }).getByRole("button", { name: "Đưa ra khỏi sổ" }).click();
  await expect(people.getByRole("listitem")).toHaveCount(1);

  // A second book, for a group the owner is in. It becomes the open one, and the first is one choice away.
  await page.getByRole("button", { name: "Tạo sổ mới" }).click();
  const create = page.getByRole("dialog", { name: "Tạo sổ mới" });
  await create.getByLabel("Tên sổ").fill("Quỹ lớp");
  await create.getByLabel("Sổ này cho ai?").selectOption({ label: "Nhóm Lớp 12A" });
  await create.getByLabel("Thành viên nhóm được làm gì?").selectOption("viewer");
  await create.getByRole("button", { name: "Tạo sổ" }).click();
  await expect(create).toHaveCount(0);
  expect(book.calls.at(-1)).toEqual({ name: "create_expense_book", body: { p_name: "Quỹ lớp", p_group_id: "g-1", p_group_role: "viewer" } });
  await expect(page.getByText("Quỹ lớp · Lớp 12A · 3 người cùng dùng · bạn là chủ sổ")).toBeVisible();
  const open = page.getByLabel("Sổ đang mở");
  await expect(open).toHaveValue("book-2");
  await expect(open.getByRole("option")).toHaveText(["Chi tiêu chung", "Quỹ lớp · Lớp 12A"]);
  // A group's book takes its people from the group, so there is nobody to invite.
  await expect(people.getByText("Mời một người bạn vào sổ")).toHaveCount(0);
  await fits(page);
  await open.selectOption("book-1");
  await expect(page.getByText("Sổ riêng của bạn · chỉ mình bạn xem được")).toBeVisible();
  await open.selectOption("book-2");

  // The open book is remembered, and deleting it asks first and says who loses what.
  await page.reload();
  await expect(open).toHaveValue("book-2");
  await people.getByRole("button", { name: "Xóa sổ này" }).click();
  const sure = page.getByRole("alertdialog", { name: "Xóa sổ “Quỹ lớp”?" });
  await expect(sure).toContainText("Mọi khoản chi, lần trả lại và lịch sử của sổ bị xóa với tất cả mọi người.");
  await sure.getByRole("button", { name: "Xóa sổ" }).click();
  await expect(page).toHaveURL(/\/expenses$/);
  await expect(page.getByText("Sổ riêng của bạn · chỉ mình bạn xem được")).toBeVisible();
  expect(book.calls.at(-1)).toEqual({ name: "delete_expense_book", body: { p_book_id: "book-2" } });
});

test("expenses among three: an amount divided between some of them, and a proposed repayment recorded in one tap", async ({ page }) => {
  await page.clock.setFixedTime(now);
  await signIn(page);
  const book = await ledgerServer(page, true);
  book.books = [summary("book-1", "Phòng trọ", { member_count: 3 })];
  book.participants = [person("p-me", "Tôi", user.id, "Vy"), person("p-linh", "Linh", linh, "Linh", 1), person("p-kha", "Kha", kha, "Kha", 2)];
  book.members = [member(user.id, "Vy", "owner", "p-me"), member(linh, "Linh", "editor", "p-linh"), member(kha, "Kha", "editor", "p-kha")];
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/expenses");
  const add = page.locator("section").filter({ has: page.getByRole("heading", { name: "Thêm khoản chi" }) });
  const balance = page.locator("section").filter({ has: page.getByRole("heading", { name: "Ai nợ ai" }) });
  await expect(balance.getByRole("status")).toHaveText("Không ai nợ ai.");

  // Three ways, 100,000 leaves one đồng over: it stays with whoever paid.
  await add.getByLabel("Số tiền").fill("100000");
  await add.getByRole("button", { name: "Thêm chi tiết" }).click();
  await expect(add.getByText(/Tôi 33\.334\s₫ · Linh 33\.333\s₫ · Kha 33\.333\s₫/)).toBeVisible();
  // Kha was not there: the amount is divided between the other two.
  const sharers = add.getByRole("group", { name: "Chia cho ai?" });
  await sharers.getByRole("button", { name: "Kha" }).click();
  await expect(sharers.getByRole("button", { name: "Kha" })).toHaveAttribute("aria-pressed", "false");
  await add.getByRole("button", { name: "Lưu khoản chi" }).click();
  await expect(page.getByText("Đã lưu khoản chi.")).toBeVisible();
  expect(book.calls.at(-1)!.body).toMatchObject({ p_amount: 100000, p_payer_id: "p-me", p_book_id: "book-1",
    p_splits: [{ participant_id: "p-me", amount: 50000 }, { participant_id: "p-linh", amount: 50000 }, { participant_id: "p-kha", amount: 0 }] });
  // The entry says between whom, and opens to be changed with the same people chosen.
  await expect(page.getByText("Tôi trả · chia cho Tôi, Linh")).toBeVisible();
  await page.getByRole("button", { name: /^Sửa khoản chi: Khoản chi, 100\.000/ }).click();
  const edit = page.getByRole("dialog", { name: "Sửa khoản chi" });
  await expect(edit.getByRole("group", { name: "Chia thế nào?" }).getByRole("button", { name: "Chia đều" })).toHaveAttribute("aria-pressed", "true");
  await expect(edit.getByRole("group", { name: "Chia cho ai?" }).getByRole("button", { pressed: true })).toHaveText(["Tôi", "Linh"]);
  await page.keyboard.press("Escape");
  await expect(edit).toHaveCount(0);
  // Nobody to divide between is refused before anything is sent.
  await add.getByLabel("Số tiền").fill("90000");
  await add.getByRole("button", { name: "Thêm chi tiết" }).click();
  for (const name of ["Tôi", "Linh", "Kha"]) await add.getByRole("group", { name: "Chia cho ai?" }).getByRole("button", { name, exact: true }).click();
  const sent = book.calls.length;
  await add.getByRole("button", { name: "Lưu khoản chi" }).click();
  await expect(add.getByRole("alert")).toHaveText("Hãy chọn ít nhất một người để chia.");
  expect(book.calls).toHaveLength(sent);

  await expect(balance.getByRole("status")).toHaveText("Còn 1 khoản cần trả lại để mọi người hết nợ nhau.");
  await expect(balance.getByRole("list", { name: "Mỗi người đang được nhận hay đang nợ" }).getByRole("listitem")).toHaveText([/Tôi.*được nhận 50\.000\s₫/, /Linh.*nợ 50\.000\s₫/, /Kha.*đã cân bằng/]);
  const owed = balance.getByRole("list", { name: "Cách trả lại gọn nhất" }).getByRole("listitem");
  await expect(owed).toHaveText([/Linh trả Tôi 50\.000\s₫/]);
  await owed.getByRole("button", { name: "Ghi là đã trả" }).click();
  await expect(balance.getByLabel("Linh trả lại Tôi bao nhiêu?")).toHaveValue("50000");
  await balance.getByRole("button", { name: "Lưu", exact: true }).click();
  await expect(balance.getByRole("status")).toHaveText("Không ai nợ ai.");
  expect(book.calls.at(-1)).toEqual({ name: "save_settlement", body: { p_id: null, p_from_participant_id: "p-linh", p_to_participant_id: "p-me", p_amount: 50000, p_settled_on: "2026-10-08", p_note: "", p_book_id: "book-1" } });
  await fits(page);

  // Where the account is deleted, the owner reads that the shared book goes with it, and finds the file to keep.
  await page.goto("/me/settings");
  await expect(page.getByText("Bạn là chủ của sổ chi tiêu “Phòng trọ”. Xóa tài khoản sẽ xóa sổ ấy với mọi người đang dùng chung. Hãy tải tệp CSV trước nếu cần giữ lại.")).toBeVisible();
  await page.getByRole("link", { name: "Mở Sổ và lịch sử" }).click();
  await expect(page.getByRole("button", { name: "Tải tệp CSV" })).toBeVisible();
  await fits(page);
});

test("expenses in English: a shared book's three screens keep no Vietnamese of the app", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("gnouht-language", "en"));
  await page.clock.setFixedTime(now);
  await signIn(page);
  const book = await ledgerServer(page, true);
  book.friends = [friend(kha, "Kha")];
  book.books = [summary("book-1", "Flat", { member_count: 3 }), summary("book-6", "Trip", { role: "viewer", status: "invited", owner_name: "Kha", invited_by_name: "Kha" })];
  book.participants = [person("p-me", "Me", user.id, "Vy"), person("p-linh", "Linh", linh, "Linh", 1), person("p-guest", "Guest", null, null, 2)];
  book.members = [member(user.id, "Vy", "owner", "p-me"), member(linh, "Linh", "editor", "p-linh"), member(kha, "Kha", "viewer", "p-guest", "invited")];
  book.categories = [{ id: "c-food", name: "Food", icon: "food", position: 0 }];
  book.expenses.push(spent("e-1", 300000, "p-me", user.id, "Dinner", [["p-me", 100000], ["p-linh", 100000], ["p-guest", 100000]]));
  book.history.push({ id: 1, operation: "insert", record_kind: "expenses", changed_at: "2026-10-08T02:00:00Z", before: null, after: { amount: 300000, note: "Dinner" }, actor_name: "Vy" });
  const vietnamese = /[À-ÖØ-öø-ÿĂăĐđĨĩŨũƠơƯưẠ-ỹ]/;
  const texts = () => page.evaluate(() => [...document.body.innerText.split("\n"), ...[...document.querySelectorAll("[aria-label],[placeholder],[title],[alt]")].flatMap(node => ["aria-label", "placeholder", "title", "alt"].map(name => node.getAttribute(name) ?? ""))].map(text => text.trim()).filter(Boolean));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/expenses");
  await expect(page.getByText("Flat · 3 people in it · you are the owner")).toBeVisible();
  await expect(page.getByText("Kha invited you to the book “Trip”.")).toBeVisible();
  const balance = page.locator("section").filter({ has: page.getByRole("heading", { name: "Who owes whom" }) });
  await expect(balance.getByRole("status")).toHaveText("2 repayments are left before nobody owes anybody.");
  await expect(balance.getByRole("listitem").filter({ hasText: "Linh pays Me" })).toBeVisible();
  await page.getByRole("button", { name: "More details" }).click();
  await expect(page.getByRole("group", { name: "Divide between whom?" })).toBeVisible();
  expect((await texts()).filter(text => vietnamese.test(text))).toEqual([]);
  await fits(page);
  await page.getByRole("button", { name: "New book" }).click();
  await expect(page.getByRole("dialog", { name: "New book" })).toBeVisible();
  expect((await texts()).filter(text => vietnamese.test(text))).toEqual([]);
  await page.keyboard.press("Escape");

  await page.goto("/expenses/stats");
  await expect(page.getByRole("heading", { name: "Who owes whom" })).toBeVisible();
  expect((await texts()).filter(text => vietnamese.test(text))).toEqual([]);
  await page.goto("/expenses/settings");
  await expect(page.getByRole("heading", { name: "People in this book · 3" })).toBeVisible();
  await expect(page.getByText("invited, no answer yet")).toBeVisible();
  await expect(page.getByText(/Added an expense.*· Vy/)).toBeVisible();
  expect((await texts()).filter(text => vietnamese.test(text))).toEqual([]);
  await fits(page);
});

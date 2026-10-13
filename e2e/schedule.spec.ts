import { expect, test, type Page } from "@playwright/test";
import { kha, signIn } from "./signedIn";

// Thursday 8 October 2026, 10:00, on the machine that runs the tests.
const now = new Date(2026, 9, 8, 10, 0);
const lan = "33333333-2222-4222-8222-222222222222";
const at = (day: number, hour: number) => new Date(2026, 9, day, hour).toISOString();
const person = (userId: string, name: string) => ({ user_id: userId, display_name: name, username: name.toLowerCase(), avatar_url: null });
const fits = (page: Page) => expect.poll(async () => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

interface Sharing {
  requests: Record<string, unknown>[];
  grants: Record<string, unknown>[];
  /** What the friend's schedule holds, as the server would count it out for a permission. */
  schedule: Record<string, unknown>[];
  calls: { name: string; body: Record<string, unknown> }[];
}

/** A server for schedule sharing that answers from `state` and records what the app asks it to change. */
async function sharingServer(page: Page, state: Sharing) {
  await page.route("**/rest/v1/**", route => {
    const request = route.request(); const path = new URL(request.url()).pathname.replace(/^.*\/rest\/v1/, "");
    const refuse = (message: string) => route.fulfill({ status: 400, json: { code: "P0001", message } });
    if (path === "/rpc/list_friend_connections") return route.fulfill({ json: [kha, lan].map((id, index) => ({ ...person(id, ["Kha", "Lan"][index]), status: "accepted", direction: "incoming", created_at: "2026-01-01T00:00:00Z" })) });
    if (path === "/rpc/list_schedule_requests") return route.fulfill({ json: state.requests });
    if (path === "/rpc/list_schedule_grants") return route.fulfill({ json: state.grants });
    if (path === "/rpc/list_shared_busy") return refuse("availability not shared");
    if (path === "/rpc/list_granted_schedule") {
      const grant = state.grants.find(item => item.direction === "received" && item.user_id === request.postDataJSON().p_owner_id);
      return grant ? route.fulfill({ json: state.schedule.map(row => ({ ...row, title: grant.detail === "details" ? row.title : null })) }) : refuse("schedule not shared");
    }
    if (["/rpc/request_schedule", "/rpc/respond_schedule_request", "/rpc/cancel_schedule_request", "/rpc/revoke_schedule_grant"].includes(path)) {
      const body = request.postDataJSON();
      state.calls.push({ name: path.slice(5), body });
      if (path === "/rpc/request_schedule") state.requests.unshift({ id: "r-new", direction: "outgoing", ...person(body.p_owner_id, "Kha"), status: "pending", message: body.p_message, created_at: now.toISOString() });
      if (path === "/rpc/cancel_schedule_request") state.requests.find(item => item.id === body.p_request_id)!.status = "cancelled";
      if (path === "/rpc/respond_schedule_request") {
        const asked = state.requests.find(item => item.id === body.p_request_id)!;
        asked.status = body.p_accept ? "accepted" : "declined";
        if (body.p_accept) state.grants.push({ direction: "given", ...person(String(asked.user_id), String(asked.display_name)), detail: body.p_detail, starts_on: body.p_starts_on, ends_on: body.p_ends_on, expires_at: new Date(now.getTime() + body.p_expires_in_days * 86_400_000).toISOString() });
      }
      if (path === "/rpc/revoke_schedule_grant") state.grants = state.grants.filter(item => !(item.direction === "given" && item.user_id === body.p_viewer_id));
      return route.fulfill({ json: null });
    }
    return route.fulfill({ json: [] });
  });
}

test("schedule sharing: a friend is asked from their calendar, and what they allow is all that shows", async ({ page }) => {
  await page.clock.setFixedTime(now);
  await signIn(page);
  const state: Sharing = { requests: [], grants: [], calls: [], schedule: [
    { event_id: "e1", occurrence_date: "2026-10-08", title: "Cấu trúc dữ liệu", all_day: false, starts_at: at(8, 13), ends_at: at(8, 15), first_day: null, end_day_exclusive: null, category: "class" },
    { event_id: "e2", occurrence_date: "2026-10-09", title: "Khám răng", all_day: false, starts_at: at(9, 15), ends_at: at(9, 16), first_day: null, end_day_exclusive: null, category: "event" },
  ] };
  await sharingServer(page, state);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/calendar/shared/${kha}`);
  await expect(page.getByRole("heading", { name: "Kha", level: 1 })).toBeVisible();

  // Nothing of the friend's schedule is on screen before they say yes.
  const access = page.getByRole("region", { name: "Quyền xem lịch" });
  const today = page.getByRole("region", { name: "Lịch Thứ năm, 8 tháng 10" });
  await expect(today.getByRole("listitem")).toHaveCount(0);
  await access.getByRole("button", { name: "Xin xem lịch" }).click();
  await expect(access).toContainText("Bạn đã hỏi xem lịch của Kha. Đang chờ trả lời.");
  expect(state.calls).toEqual([{ name: "request_schedule", body: { p_owner_id: kha, p_message: "" } }]);
  await expect(today.getByRole("listitem")).toHaveCount(0);
  await fits(page);

  // The friend says yes to busy times. The server's event reloads the calendar; here the page is opened again.
  state.requests[0].status = "accepted";
  state.grants.push({ direction: "received", ...person(kha, "Kha"), detail: "busy", starts_on: "2026-10-08", ends_on: "2026-10-21", expires_at: at(15, 10) });
  await page.reload();
  await expect(access).toContainText("Kha cho bạn xem lịch. Chỉ lúc bận · 8/10 – 21/10 · hết hạn 15/10");
  await expect(today.getByRole("listitem")).toHaveText([/13:00.*15:00.*Bận/]);
  await expect(page.getByText("Cấu trúc dữ liệu")).toHaveCount(0);

  // With a permission for names the same times carry their names.
  state.grants[0].detail = "details";
  await page.reload();
  await expect(access).toContainText("Cả tên sự kiện");
  await expect(today.getByRole("listitem")).toHaveText([/13:00.*15:00.*Cấu trúc dữ liệu/]);

  // Taken back: the next read is refused and the calendar is empty again.
  state.grants = [];
  await page.reload();
  await expect(access.getByRole("button", { name: "Xin xem lịch" })).toBeVisible();
  await expect(today.getByRole("listitem")).toHaveCount(0);
});

test("schedule sharing: the owner answers a question with the least by default, sees who can look, and takes it back", async ({ page }) => {
  await page.clock.setFixedTime(now);
  await signIn(page);
  const state: Sharing = { grants: [], calls: [], schedule: [], requests: [
    { id: "r1", direction: "incoming", ...person(kha, "Kha"), status: "pending", message: "Tuần sau rảnh hôm nào?", created_at: at(8, 9) },
    { id: "r2", direction: "incoming", ...person(lan, "Lan"), status: "pending", message: "", created_at: at(8, 8) },
  ] };
  await sharingServer(page, state);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/calendar");
  // The calendar's tab counts the friends who wait, and the strip leads to the screen where they are answered.
  const bar = page.getByRole("navigation", { name: "Điều hướng chính" }).last();
  await expect(bar.getByLabel("2 yêu cầu xem lịch đang chờ")).toBeVisible();
  await page.getByRole("navigation", { name: "Trong màn này" }).getByRole("link", { name: /Chia sẻ lịch/ }).click();
  await expect(page.getByRole("heading", { name: "Chia sẻ lịch", level: 1 })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Đang chờ bạn trả lời · 2" })).toBeVisible();
  await fits(page);

  // A yes without touching anything: busy times only, two weeks from today, for a week.
  const fromKha = page.getByRole("article", { name: "Yêu cầu của Kha" });
  await expect(fromKha).toContainText("“Tuần sau rảnh hôm nào?”");
  await expect(fromKha.getByLabel("Chỉ lúc bận")).toBeChecked();
  await expect(fromKha.getByLabel("Từ ngày")).toHaveValue("2026-10-08");
  await expect(fromKha.getByLabel("Đến ngày")).toHaveValue("2026-10-21");
  // Names are a choice the owner has to make, and the screen says what it means.
  await fromKha.getByLabel("Cả tên sự kiện").check();
  await expect(fromKha).toContainText("kể cả sự kiện bạn để “Chỉ mình tôi”");
  await fromKha.getByLabel("Chỉ lúc bận").check();
  // A range that ends before it starts cannot be sent.
  await fromKha.getByLabel("Đến ngày").fill("2026-10-07");
  await expect(fromKha.getByRole("alert")).toHaveText("Ngày cuối phải bằng hoặc sau ngày bắt đầu.");
  await expect(fromKha.getByRole("button", { name: "Đồng ý" })).toBeDisabled();
  await fromKha.getByLabel("Đến ngày").fill("2026-10-21");
  await fromKha.getByRole("button", { name: "Đồng ý" }).click();
  await expect(page.getByRole("status")).toContainText("Đã đồng ý. Kha xem được lịch của bạn");
  expect(state.calls[0]).toEqual({ name: "respond_schedule_request", body: { p_request_id: "r1", p_accept: true, p_detail: "busy", p_starts_on: "2026-10-08", p_ends_on: "2026-10-21", p_expires_in_days: 7 } });

  // A no gives nothing.
  await page.getByRole("article", { name: "Yêu cầu của Lan" }).getByRole("button", { name: "Từ chối" }).click();
  await expect(page.getByRole("heading", { name: /Đang chờ bạn trả lời/ })).toHaveCount(0);
  expect(state.calls[1]).toEqual({ name: "respond_schedule_request", body: { p_request_id: "r2", p_accept: false } });
  await expect(bar.getByLabel(/yêu cầu xem lịch đang chờ/)).toHaveCount(0);

  // Who can look is listed here and on the privacy screen, each with a way to stop it.
  const viewers = page.locator("section").filter({ has: page.getByRole("heading", { name: "Đang xem được lịch của bạn · 1" }) });
  await expect(viewers).toContainText("Kha");
  await expect(viewers).toContainText("Chỉ lúc bận · 8/10 – 21/10 · hết hạn 15/10");
  await page.goto("/me/privacy");
  const privacy = page.locator("section").filter({ has: page.getByRole("heading", { name: "Sự kiện trong lịch" }) });
  await expect(privacy).toContainText("Kha");
  await privacy.getByRole("button", { name: "Thu hồi" }).click();
  await expect(privacy.getByRole("button", { name: "Thu hồi" })).toHaveCount(0);
  expect(state.calls[2]).toEqual({ name: "revoke_schedule_grant", body: { p_viewer_id: kha } });
});

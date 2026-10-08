import { expect, test } from "@playwright/test";
import { kha, signIn, user } from "./signedIn";

// Thursday 8 October 2026, 10:00, on the machine that runs the tests.
const now = new Date(2026, 9, 8, 10, 0);
const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
const at = (day: number, hour: number, minute = 0) => new Date(2026, 9, day, hour, minute).toISOString();

test("statistics: each part of the app counts the last days, and the period can be made longer", async ({ page }) => {
  await page.clock.setFixedTime(now);
  await signIn(page);
  const task = (id: string, completed: string | null, due: string | null = null) => ({ id, title: id, priority: "medium", due_at: due, completed_at: completed, tags: [] });
  await page.route("**/rest/v1/**", route => {
    const url = new URL(route.request().url()); const path = url.pathname;
    if (path.endsWith("/personal_tasks")) return route.fulfill({ json: url.searchParams.get("recurrence")?.startsWith("in.")
      ? [{ id: "h1", title: "Đọc 20 phút", recurrence: "daily" }]
      : [task("a", at(8, 9)), task("b", at(8, 9, 30)), task("c", at(6, 20)), task("d", at(1, 20)), task("open", null), task("overdue", null, at(7, 12))] });
    if (path.endsWith("/profiles")) return route.fulfill({ json: { id: user.id, display_name: "Vy", username: "vy", timezone: zone, bio: "", birthday: null } });
    if (path.endsWith("/routine_completions")) return route.fulfill({ json: ["2026-10-08", "2026-10-07", "2026-10-06", "2026-10-04"].map(day => ({ task_id: "h1", completion_date: day })) });
    if (path.endsWith("/calendar_events")) return route.fulfill({ json: [{ id: "class", owner_id: user.id, title: "Cấu trúc dữ liệu", event_kind: "timed", start_at: at(1, 7, 30), end_at: at(1, 9, 30),
      all_day_start: null, all_day_end_exclusive: null, timezone: zone, visibility: "only_me", recurrence_rule: "weekly", recurrence_until: "2026-12-31", calendar_event_exceptions: [], category: "class", place: null }] });
    if (path.endsWith("/meetup_invitees")) return route.fulfill({ json: [
      { rsvp_status: "going", meetup: { id: "m1", group_id: null, organizer_id: kha, title: "Cà phê", description: "", status: "confirmed", timezone: zone, start_at: at(6, 16), end_at: at(6, 18), capacity: null, location_name: null } },
      { rsvp_status: "pending", meetup: { id: "m2", group_id: null, organizer_id: kha, title: "Xem phim", description: "", status: "proposed", timezone: zone, start_at: null, end_at: null, capacity: null, location_name: null } }] });
    if (path.endsWith("/rpc/list_conversations")) return route.fulfill({ json: [
      { id: "c1", kind: "direct", title: "Kha", other_user_id: kha, recent_messages: 40, last_message_at: at(8, 9), last_message_body: "Ok", unread_count: 2 },
      { id: "c2", kind: "group", title: "Nhóm đồ án", other_user_id: null, recent_messages: 10, last_message_at: at(7, 9), last_message_body: "Ok", unread_count: 0 }] });
    return route.fulfill({ json: [] });
  });
  await page.goto("/");
  // Reached from the menu, like every screen of the app.
  await page.getByRole("complementary").getByRole("link", { name: "Thống kê" }).click();
  await expect(page.getByRole("heading", { name: "Thống kê", level: 1 })).toBeVisible();

  const card = (title: string | RegExp) => page.locator("section").filter({ has: page.getByRole("heading", { name: title, level: 2 }) });
  // Seven days: 2 to 8 October.
  await expect(card("Việc")).toContainText("3việc đã xong");
  await expect(card("Việc")).toContainText("2việc còn lại");
  await expect(card("Việc")).toContainText("1việc quá hạn");
  const done = card("Việc").getByRole("list", { name: "Việc xong mỗi ngày" }).getByRole("listitem");
  await expect(done).toHaveCount(7);
  await expect(done.last()).toHaveAttribute("aria-label", "Thứ năm, 8 tháng 10: 2 việc xong");
  // Today's bar is the tallest and fills the chart; the day with one task is half of it.
  const heights = await done.evaluateAll(items => items.map(item => Math.round((item.querySelector("i")?.getBoundingClientRect().height ?? 0))));
  expect(heights[6]).toBeGreaterThan(80);
  expect(Math.abs(heights[4] * 2 - heights[6])).toBeLessThanOrEqual(2);
  expect(heights[5]).toBe(0);

  await expect(card("Thói quen")).toContainText("4/7 ngày");
  await expect(card("Thói quen")).toContainText("57%lần giữ được");
  // Two class hours on each Thursday of the seven days: only 8 October.
  await expect(card("Lịch")).toContainText("2giờ học");
  await expect(card("Hoạt động")).toContainText("1buổi đã diễn ra");
  await expect(card("Hoạt động")).toContainText("1lời mời chờ bạn");
  await expect(card(/^Trò chuyện/)).toContainText("50tin nhắn");
  await expect(card(/^Trò chuyện/).getByRole("listitem")).toHaveText([/Kha.*40 tin/, /Nhóm đồ án.*10 tin/]);

  // Thirty days: 9 September to 8 October.
  await page.getByRole("group", { name: "Khoảng thời gian" }).getByRole("button", { name: "30 ngày qua" }).click();
  await expect(card("Việc")).toContainText("4việc đã xong");
  await expect(done).toHaveCount(30);
  await expect(card("Thói quen")).toContainText("4/30 ngày");
  await expect(card("Lịch")).toContainText("4giờ học");

  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(async () => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

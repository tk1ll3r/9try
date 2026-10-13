import { expect, test, type Page } from "@playwright/test";
import { signIn, user } from "./signedIn";

// The screens the plan asks to hold to one standard: Friends, Groups, Today, Tasks, Notes, Settings.
const people = ["Kha", "Lan", "Thu", "An", "Bình", "Chi", "Dũng", "Giang", "Hà"];
const idOf = (index: number) => `${String(index + 2).padStart(8, "0")}-2222-4222-8222-222222222222`;
const groupId = "99999999-9999-4999-8999-999999999999";
const hours = (count: number) => new Date(Date.now() + count * 3_600_000).toISOString();

/** A small world: nine friends, one asking, a class group the user owns, four tasks with labels, two notes. */
async function world(page: Page, calls: { name: string; body: unknown }[] = []) {
  await page.route("**/rest/v1/**", route => {
    const request = route.request(); const url = new URL(request.url()); const path = url.pathname.replace(/^.*\/rest\/v1/, "");
    if (path === "/rpc/list_friend_connections") return route.fulfill({ json: [
      ...people.map((name, index) => ({ user_id: idOf(index), display_name: name, username: name.toLowerCase(), avatar_url: null, status: "accepted", direction: "incoming", created_at: "2026-01-01T00:00:00Z" })),
      { user_id: idOf(40), display_name: "Phúc", username: "phuc", avatar_url: null, status: "pending", direction: "incoming", created_at: "2026-01-01T00:00:00Z" }] });
    if (path === "/group_memberships") return route.fulfill({ json: [{ role: "owner", group: { id: groupId, name: "Lớp KTPM", description: "Nhóm lớp", member_count: 10, archived_at: null } }] });
    if (path === "/rpc/list_group_members") return route.fulfill({ json: [{ user_id: user.id, display_name: "Vy", username: "vy", avatar_url: null, role: "owner", joined_at: "2026-01-01T00:00:00Z" },
      ...people.map((name, index) => ({ user_id: idOf(index), display_name: name, username: name.toLowerCase(), avatar_url: null, role: index === 0 ? "admin" : "member", joined_at: "2026-01-01T00:00:00Z" }))] });
    if (path === "/personal_tasks") return route.fulfill({ json: url.searchParams.get("recurrence")?.startsWith("in.") ? [{ id: "h1", title: "Đọc 20 phút", recurrence: "daily" }] : [
      { id: "t1", title: "Nộp bài tập giải tích", priority: "high", due_at: hours(-30), completed_at: null, tags: ["giảitích"] },
      { id: "t2", title: "Mua vở", priority: "medium", due_at: hours(3), completed_at: null, tags: ["trường"] },
      { id: "t3", title: "Gọi về nhà", priority: "low", due_at: null, completed_at: null, tags: [] }] });
    if (path === "/personal_notes") return route.fulfill({ json: [{ id: "n1", title: "Họp nhóm đồ án", body: "Phòng B4.14", updated_at: "2026-10-01T00:00:00Z" }] });
    if (path.startsWith("/rpc/") && request.method() === "POST" && !path.startsWith("/rpc/list_")) calls.push({ name: path.slice(5), body: request.postDataJSON() });
    return route.fulfill({ json: path.startsWith("/rpc/") ? null : [] });
  });
}

test("friends on a phone: who is asking can be read, adding starts at the top, a long list is searched", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page);
  await world(page);
  await page.goto("/me/friends");

  // The name of the person who asks, next to the two buttons that answer them.
  const waiting = page.locator("section", { hasText: "Đang chờ bạn · 1" });
  await expect(waiting.getByText("Phúc", { exact: true })).toBeVisible();
  expect((await waiting.getByText("Phúc", { exact: true }).boundingBox())!.width).toBeGreaterThan(30);
  await expect(waiting.getByRole("button", { name: "Chấp nhận" })).toBeVisible();

  // Nine friends: a search box, which reads names without their marks.
  const friends = page.locator("section", { hasText: "Bạn bè · 9" });
  await friends.getByRole("searchbox", { name: "Tìm trong bạn bè" }).fill("dung");
  await expect(friends.getByRole("button", { name: /^Xem hồ sơ của/ })).toHaveText([/Dũng/]);
  await friends.getByRole("searchbox").fill("zzz");
  await expect(friends.getByText("Không có người bạn nào tên như vậy.")).toBeVisible();

  // The way to add someone is at the foot of the page; the button at the top takes the person there.
  await page.getByRole("button", { name: "Thêm bạn", exact: true }).click();
  await expect(page.getByLabel("Username người bạn muốn mời")).toBeFocused();
  await expect(page.getByLabel("Username người bạn muốn mời")).toBeInViewport();
  await expect.poll(async () => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("a group on a phone: a member is one row, and what its owner can do is behind the row's menu", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page);
  const calls: { name: string; body: unknown }[] = [];
  await world(page, calls);
  await page.goto(`/groups/${groupId}`);
  await expect(page.getByRole("heading", { name: "Thành viên · 10" })).toBeVisible();

  // Ten rows fit in less than two screens; they used to carry three buttons each.
  const members = page.locator("section", { hasText: "Thành viên · 10" });
  expect((await members.boundingBox())!.height).toBeLessThan(2 * 844);
  // Nothing to do to oneself.
  await expect(members.getByLabel("Thao tác khác với Vy")).toHaveCount(0);

  await members.getByLabel("Thao tác khác với Kha").click();
  await page.getByRole("button", { name: "Bỏ quản trị" }).click();
  await expect.poll(() => calls.at(-1)).toEqual({ name: "set_group_member_role", body: { p_group_id: groupId, p_user_id: idOf(0), p_role: "member" } });

  // Removing someone still asks first.
  await members.getByRole("searchbox", { name: "Tìm thành viên" }).fill("ha");
  await expect(members.getByText("Hà", { exact: true })).toBeVisible();
  await expect(members.getByText("Lan", { exact: true })).toHaveCount(0);
  await members.getByLabel("Thao tác khác với Hà").click();
  await page.getByRole("button", { name: "Xóa khỏi nhóm" }).click();
  await page.getByRole("alertdialog", { name: "Xóa khỏi nhóm?" }).getByRole("button", { name: "Xóa khỏi nhóm" }).click();
  await expect.poll(() => calls.at(-1)).toEqual({ name: "remove_group_member", body: { p_group_id: groupId, p_user_id: idOf(8) } });
});

test("the audited screens on a phone: nothing to press is shorter than a finger, and nothing runs off the side", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page);
  await world(page);
  for (const path of ["/me/friends", "/groups", `/groups/${groupId}`, "/today", "/me/organizer", "/notes", "/me/settings"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await page.waitForLoadState("networkidle");
    const short = await page.evaluate(() => [...document.querySelectorAll<HTMLElement>("a, button, input, select, textarea, summary")].flatMap(element => {
      const box = element.getBoundingClientRect();
      if (!box.width || !box.height || getComputedStyle(element).visibility === "hidden" || element.closest(".sr-only") || (element as HTMLButtonElement).disabled) return [];
      // What a closed menu holds cannot be pressed, and a checkbox is pressed through its row.
      if (element.closest("details:not([open])") && element.tagName !== "SUMMARY") return [];
      if (element.matches("input[type=checkbox], input[type=radio]") && (element.closest("label")?.getBoundingClientRect().height ?? 0) >= 44) return [];
      return box.height < 43.5 ? [`${Math.round(box.width)}x${Math.round(box.height)} ${element.tagName.toLowerCase()} "${(element.getAttribute("aria-label") || element.textContent || "").trim().slice(0, 30)}"`] : [];
    }));
    expect(short, `controls under 44 px on ${path}`).toEqual([]);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `sideways overflow on ${path}`).toBe(true);
  }
});

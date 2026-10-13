import { expect, test } from "@playwright/test";
import { signIn, user } from "./signedIn";

test("push settings: what stands in the way, the person's devices with what each answered last, a test, and what a push may say", async ({ page }) => {
  await signIn(page);
  let devices: Record<string, unknown>[] = [
    { id: "d1", user_id: user.id, endpoint: "https://push.example/phone", label: "Chrome · Android", language: "vi", created_at: "2026-10-01T03:00:00Z", last_success_at: "2026-10-08T02:05:00Z", last_failure_at: null, last_error: null },
    { id: "d2", user_id: user.id, endpoint: "https://push.example/old", label: "Safari · iPhone", language: "en", created_at: "2026-09-01T03:00:00Z", last_success_at: null, last_failure_at: "2026-10-07T02:05:00Z", last_error: "HTTP 403" },
  ];
  const prefs: Record<string, unknown> = { user_id: user.id, push_enabled: true, quiet_start: null, quiet_end: null, category_push: {}, private_previews: false };
  const saved: Record<string, unknown>[] = [];
  const removed: string[] = [];
  await page.route("**/rest/v1/**", route => {
    const request = route.request(); const url = new URL(request.url()); const path = url.pathname.replace(/^.*\/rest\/v1/, "");
    if (path === "/push_subscriptions") {
      if (request.method() === "DELETE") { const id = url.searchParams.get("id")!.replace("eq.", ""); removed.push(id); devices = devices.filter(device => device.id !== id); return route.fulfill({ status: 204, body: "" }); }
      return route.fulfill({ json: devices });
    }
    if (path === "/notification_preferences") {
      if (request.method() === "POST") { saved.push(request.postDataJSON()); Object.assign(prefs, saved.at(-1)); return route.fulfill({ status: 201, body: "" }); }
      return route.fulfill({ json: prefs });
    }
    return route.fulfill({ json: [] });
  });
  let tests = 0;
  await page.route("**/functions/v1/send-test-push", route => { tests++; return route.fulfill({ json: { devices: [{ device: "d1", status: 201, error: null }, { device: "d2", status: 403, error: "HTTP 403" }] } }); });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/me/settings");
  const card = page.locator("section").filter({ has: page.getByRole("heading", { name: "Thông báo đẩy" }) });

  // Each thing that push needs is listed with whether it is there. This build has no push key.
  const setup = card.getByRole("list", { name: "Tình trạng thiết lập" });
  await expect(setup.getByRole("listitem")).toHaveCount(4);
  await expect(setup).toContainText("Bản ứng dụng này chưa bật thông báo đẩy.");
  await expect(setup).toContainText("Thiết bị này chưa đăng ký nhận thông báo đẩy.");

  // The person's devices, each with what its push service said last.
  await expect(card.getByText("Thiết bị nhận thông báo · 2")).toBeVisible();
  const phone = card.getByRole("listitem").filter({ hasText: "Chrome · Android" });
  const old = card.getByRole("listitem").filter({ hasText: "Safari · iPhone" });
  await expect(phone).toContainText("Gửi được lần gần nhất lúc");
  await expect(old).toContainText("Lần gửi gần nhất bị từ chối (HTTP 403)");

  // A test push answers at once, device by device.
  await card.getByRole("button", { name: "Gửi thông báo thử" }).click();
  await expect(card.getByRole("status")).toHaveText("Đã gửi tới 1/2 thiết bị. Xem thiết bị bị lỗi ở dưới.");
  await expect(phone).toContainText("Đã nhận thông báo thử.");
  await expect(old).toContainText("Thông báo thử bị từ chối: HTTP 403");
  expect(tests).toBe(1);

  // A device that no longer works is taken off the list.
  await card.getByRole("button", { name: "Gỡ thiết bị Safari · iPhone" }).click();
  await expect(card.getByText("Thiết bị nhận thông báo · 1")).toBeVisible();
  expect(removed).toEqual(["d2"]);

  // What a push may say, and which kinds are pushed. One line can stand for two kinds the database writes.
  await card.getByLabel("Ẩn nội dung trên màn hình khóa").check();
  await expect.poll(() => saved.at(-1)?.private_previews).toBe(true);
  await card.getByLabel("Sự kiện bạn bè cho bạn xem").uncheck();
  await expect.poll(() => saved.at(-1)?.category_push).toEqual({ event_shared: false, event_changed: false });
  // Alerts about a pinned friend's mode are off until asked for.
  const modeAlerts = card.getByLabel("Báo khi người bạn đã ghim bật mode");
  await expect(modeAlerts).not.toBeChecked();
  await modeAlerts.check();
  await expect.poll(() => saved.at(-1)?.category_push).toEqual({ event_shared: false, event_changed: false, friend_mode: true });
  expect(saved.at(-1)).toMatchObject({ user_id: user.id, push_enabled: true, private_previews: true });
  await expect.poll(async () => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

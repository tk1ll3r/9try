import { expect, test, type Page } from "@playwright/test";
import { kha, signIn, user } from "./signedIn";

const lan = "33333333-2222-4222-8222-222222222222";
const friend = (userId: string, name: string) => ({ user_id: userId, display_name: name, username: name.toLowerCase(), avatar_url: null, status: "accepted", direction: "incoming", created_at: "2026-01-01T00:00:00Z" });

/** A server that keeps one person's presence choices and records what the app tells it. */
async function presenceServer(page: Page, start: { audience: string; show_last_active: boolean } | null) {
  const state = { settings: start, viewers: [] as string[], calls: [] as { name: string; body: Record<string, unknown> }[] };
  await page.route("**/rest/v1/**", route => {
    const request = route.request(); const path = new URL(request.url()).pathname.replace(/^.*\/rest\/v1/, "");
    if (path === "/rpc/list_friend_connections") return route.fulfill({ json: [friend(kha, "Kha"), friend(lan, "Lan")] });
    if (path === "/presence_settings") return route.fulfill({ json: state.settings });
    if (path === "/presence_viewers") return route.fulfill({ json: state.viewers.map(viewer_id => ({ viewer_id })) });
    // Kha has the app open. Lan does not share her presence, so the server says nothing about her.
    if (path === "/rpc/list_friend_presence") return route.fulfill({ json: [{ user_id: kha, state: "active", last_active_at: null }] });
    if (path.startsWith("/rpc/presence_") || path === "/rpc/set_presence_sharing") {
      const body = request.postDataJSON();
      state.calls.push({ name: path.slice(5), body });
      if (path === "/rpc/set_presence_sharing") {
        state.settings = { audience: body.p_audience, show_last_active: body.p_show_last_active };
        state.viewers = body.p_viewer_ids;
        return route.fulfill({ json: null });
      }
      return route.fulfill({ json: path === "/rpc/presence_heartbeat" ? !!state.settings && state.settings.audience !== "nobody" : null });
    }
    return route.fulfill({ json: [] });
  });
  return state;
}
const named = (state: { calls: { name: string }[] }, name: string) => state.calls.filter(call => call.name === name).length;
/** What a phone does when its owner switches to another app, and when they come back. */
const show = (page: Page, visible: boolean) => page.evaluate(next => {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => next ? "visible" : "hidden" });
  document.dispatchEvent(new Event("visibilitychange"));
}, visible);

test("presence: the app says it is open on every screen, says goodbye when it is hidden, and beats again when it is back", async ({ page }) => {
  await page.clock.install();
  await signIn(page);
  const sharing = await presenceServer(page, { audience: "friends", show_last_active: false });
  // Any screen, not only Mode: the heartbeat belongs to the signed-in app.
  await page.goto("/notes");
  await expect.poll(() => named(sharing, "presence_heartbeat")).toBe(1);
  const session = sharing.calls[0].body.p_session_id;
  expect(session).toMatch(/^[0-9a-f-]{36}$/);

  // Every 30 seconds while the app is on screen, with the same session.
  await page.clock.fastForward(30_000);
  await expect.poll(() => named(sharing, "presence_heartbeat")).toBe(2);

  // Another app in front: one goodbye, then silence.
  await show(page, false);
  await expect.poll(() => named(sharing, "presence_leave")).toBe(1);
  await page.clock.fastForward(120_000);
  expect(named(sharing, "presence_heartbeat")).toBe(2);

  // Back in front: a beat at once.
  await show(page, true);
  await expect.poll(() => named(sharing, "presence_heartbeat")).toBe(3);
  expect(sharing.calls.every(call => call.body.p_session_id === session)).toBe(true);
});

test("presence: a person who does not share is asked about once and never again", async ({ page }) => {
  await page.clock.install();
  await signIn(page);
  const quiet = await presenceServer(page, null);
  await page.goto("/notes");
  await expect.poll(() => named(quiet, "presence_heartbeat")).toBe(1);
  await page.clock.fastForward(180_000);
  await show(page, false);
  await show(page, true);
  await page.clock.fastForward(60_000);
  expect(quiet.calls.map(call => call.name)).toEqual(["presence_heartbeat"]);
});

test("presence: chosen on the privacy screen, shown on Mode and on a friend's card in the app's own words", async ({ page }) => {
  await signIn(page);
  const server = await presenceServer(page, null);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/me/privacy");
  const card = page.locator("section").filter({ has: page.getByRole("heading", { name: "Trạng thái mở ứng dụng" }) });
  // Off until the person chooses otherwise.
  await expect(card.getByLabel("Không ai")).toBeChecked();
  await expect(card.getByText("Hiện không ai thấy trạng thái mở ứng dụng của bạn.")).toBeVisible();
  await expect(card.getByLabel("Cho thấy cả lần gần nhất bạn mở ứng dụng")).toBeDisabled();

  await card.getByLabel("Mọi bạn bè").check();
  await expect(card.getByText("Mọi bạn bè của bạn thấy khi bạn đang mở ứng dụng.")).toBeVisible();
  expect(server.calls.find(call => call.name === "set_presence_sharing")!.body).toEqual({ p_audience: "friends", p_viewer_ids: [], p_show_last_active: false });
  // Turning it on starts the heartbeat without a reload.
  await expect.poll(() => named(server, "presence_heartbeat")).toBeGreaterThan(1);

  // "Bạn bè tôi chọn" waits for a friend: until one is ticked nothing is sent and nobody is added.
  const saves = () => named(server, "set_presence_sharing");
  await card.getByLabel("Bạn bè tôi chọn").check();
  await expect(card.getByText("Chọn ít nhất một người bạn.", { exact: false })).toBeVisible();
  expect(saves()).toBe(1);
  await card.getByLabel("Kha").check();
  await expect(card.getByText("1 người bạn thấy khi bạn đang mở ứng dụng.")).toBeVisible();
  await card.getByLabel("Cho thấy cả lần gần nhất bạn mở ứng dụng").check();
  await expect.poll(saves).toBe(3);
  expect(server.calls.filter(call => call.name === "set_presence_sharing").at(-1)!.body).toEqual({ p_audience: "selected", p_viewer_ids: [kha], p_show_last_active: true });
  await expect.poll(async () => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

  // Mode: the friend whose app is open is marked so. A friend who does not share has no mark at all.
  await page.goto("/");
  const rows = page.locator('section[aria-label="Mọi người"] > ul > li');
  await expect(rows).toHaveText([/Kha.*Chưa bật mode · Đang mở ứng dụng/, /Lan.*Chưa bật mode$/]);

  // The friend's card says it in full, and never "offline".
  await page.goto("/me/friends");
  await page.getByRole("button", { name: "Xem hồ sơ của Lan" }).click();
  await expect(page.getByRole("dialog", { name: "Lan" })).toContainText("Không rõ trạng thái");
  await page.keyboard.press("Escape");
  await page.getByRole("button", { name: "Xem hồ sơ của Kha" }).click();
  await expect(page.getByRole("dialog", { name: "Kha" })).toContainText("Đang mở ứng dụng");
});

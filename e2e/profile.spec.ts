import { expect, test, type Page } from "@playwright/test";
import { kha, signIn, user } from "./signedIn";

/** A 400×300 photo, drawn by the browser: enough to read, cut and turn into the stored JPEG. */
async function photoFrom(page: Page): Promise<Buffer> {
  const png = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 400; canvas.height = 300;
    const context = canvas.getContext("2d")!;
    context.fillStyle = "#3b82f6"; context.fillRect(0, 0, 400, 300);
    context.fillStyle = "#facc15"; context.fillRect(100, 50, 200, 200);
    return canvas.toDataURL("image/png");
  });
  return Buffer.from(png.split(",")[1], "base64");
}
const fits = (page: Page) => expect.poll(async () => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

test("profile: a picture cut on the device, a username checked while typing, and a form that says what is not saved", async ({ page }) => {
  await signIn(page);
  const row: Record<string, unknown> = { id: user.id, display_name: "Vy Trần", username: "vy_tran", bio: "Thích cà phê", timezone: "Asia/Ho_Chi_Minh", birthday: "2004-03-09", avatar_url: null, profile_visibility: { birthday: "private", bio: "friends", interests: "friends" } };
  const saves: Record<string, unknown>[] = [];
  let reads = 0;
  await page.route("**/rest/v1/**", route => {
    const request = route.request(); const path = new URL(request.url()).pathname.replace(/^.*\/rest\/v1/, "");
    if (path === "/rpc/username_available") return route.fulfill({ json: request.postDataJSON().p_username !== "kha" });
    if (path !== "/profiles") return route.fulfill({ json: [] });
    if (request.method() === "PATCH") { saves.push(request.postDataJSON()); Object.assign(row, saves.at(-1)); return route.fulfill({ status: 204, body: "" }); }
    reads++;
    return route.fulfill({ json: row });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/me");

  // What friends see is at the top; nothing is waiting to be saved.
  const save = page.getByRole("button", { name: "Lưu hồ sơ" });
  await expect(page.locator(".page-slot").getByText("@vy_tran")).toBeVisible();
  await expect(page.getByText("Mọi thay đổi đã được lưu.")).toBeVisible();
  await expect(save).toBeDisabled();
  await fits(page);

  // The username is checked a moment after typing stops. A taken one cannot be saved.
  const username = page.getByLabel("Username");
  await username.fill("kha");
  await expect(page.locator("#username-help")).toHaveText("Username này đã có người dùng. Hãy chọn username khác.");
  await expect(save).toBeDisabled();
  await username.fill("Có dấu");
  await expect(page.locator("#username-help")).toContainText("3–20 ký tự");
  await username.fill("vy_moi");
  await expect(page.locator("#username-help")).toHaveText("Username này dùng được.");
  await expect(page.getByText("Có thay đổi chưa lưu.")).toBeVisible();
  await expect(page.locator(".page-slot").getByText("@vy_moi")).toBeVisible();

  // A photo is cut to a square here and shown at once; it is saved with the rest of the form.
  await page.getByLabel("Thêm ảnh").setInputFiles({ name: "me.png", mimeType: "image/png", buffer: await photoFrom(page) });
  const editor = page.getByRole("dialog", { name: "Cắt ảnh đại diện" });
  await editor.getByLabel("Phóng to").fill("2");
  await editor.getByRole("button", { name: "Dùng ảnh này" }).click();
  await expect(editor).toHaveCount(0);
  await expect(page.locator(".page-slot img")).toHaveAttribute("src", /^data:image\/jpeg;base64,/);
  await expect(page.getByLabel("Đổi ảnh")).toBeAttached();

  // The birthday can be shown to friends, without its year.
  await page.getByLabel("Ai thấy ngày sinh?").selectOption("friends");
  await expect(page.getByText("Sinh nhật 9 tháng 3")).toBeVisible();

  // Coming back to the app reloads the profile in the background. What was typed stays.
  const before = reads;
  await page.evaluate(() => window.dispatchEvent(new Event("visibilitychange")));
  await expect.poll(() => reads).toBeGreaterThan(before);
  await expect(username).toHaveValue("vy_moi");

  await save.click();
  await expect(page.getByText("Đã lưu hồ sơ.")).toBeVisible();
  await expect(save).toBeDisabled();
  expect(saves).toHaveLength(1);
  expect(saves[0]).toMatchObject({ display_name: "Vy Trần", username: "vy_moi", birthday: "2004-03-09", profile_visibility: { bio: "friends", birthday: "friends", interests: "friends" } });
  expect(String(saves[0].avatar_url)).toMatch(/^data:image\/jpeg;base64,[A-Za-z0-9+/]+=*$/);
  expect(String(saves[0].avatar_url).length).toBeLessThan(60_000);

  // Taking the picture away is a change like any other, and can be dropped before it is saved.
  await page.getByRole("button", { name: "Gỡ ảnh" }).click();
  await expect(page.locator(".page-slot img")).toHaveCount(0);
  await page.getByRole("button", { name: "Bỏ thay đổi" }).click();
  await expect(page.locator(".page-slot img")).toHaveCount(1);
  await expect(page.getByText("Mọi thay đổi đã được lưu.")).toBeVisible();
  expect(saves).toHaveLength(1);
  await fits(page);
});

test("friends: a friend's name opens their card, with what they show to friends", async ({ page }) => {
  await signIn(page);
  const asked: unknown[] = [];
  await page.route("**/rest/v1/**", route => {
    const request = route.request(); const path = new URL(request.url()).pathname.replace(/^.*\/rest\/v1/, "");
    if (path === "/rpc/list_friend_connections") return route.fulfill({ json: [{ user_id: kha, display_name: "Kha", username: "kha", avatar_url: "data:image/jpeg;base64,/9j/4AAQSkZJRg==", status: "accepted", direction: "incoming", created_at: "2026-01-01T00:00:00Z" }] });
    if (path === "/rpc/get_profile_card") { asked.push(request.postDataJSON()); return route.fulfill({ json: [{ user_id: kha, display_name: "Kha", username: "kha", avatar_url: null, bio: "Hay rảnh tối thứ sáu", birthday: "11-02" }] }); }
    return route.fulfill({ json: [] });
  });
  await page.goto("/me/friends");
  await expect(page.locator(".page-slot img")).toHaveAttribute("src", /^data:image\/jpeg/);
  await page.getByRole("button", { name: "Xem hồ sơ của Kha" }).click();
  const card = page.getByRole("dialog", { name: "Kha" });
  await expect(card).toContainText("@kha");
  await expect(card).toContainText("Hay rảnh tối thứ sáu");
  await expect(card).toContainText("Sinh nhật 2 tháng 11");
  await expect(card.getByRole("link", { name: "Nhắn tin" })).toHaveAttribute("href", `/chat/with/${kha}`);
  await expect(card.getByRole("link", { name: "Xem lịch" })).toHaveAttribute("href", `/calendar/shared/${kha}`);
  expect(asked).toEqual([{ p_user_id: kha }]);
});

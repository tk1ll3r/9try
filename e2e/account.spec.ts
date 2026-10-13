import { expect, test } from "@playwright/test";
import { signIn, user } from "./signedIn";

const profile = { id: user.id, display_name: "Vy Trần", username: "vy_tran", bio: "", timezone: "Asia/Ho_Chi_Minh", birthday: null };

test("the account menu in the top right corner: who is signed in, their screens, the look of the app, and the way out", async ({ page }) => {
  await signIn(page);
  await page.route("**/rest/v1/**", route => route.fulfill({ json: new URL(route.request().url()).pathname.endsWith("/profiles") ? profile : [] }));
  await page.emulateMedia({ colorScheme: "light" });
  await page.goto("/calendar");

  const account = page.getByLabel("Tài khoản và cài đặt");
  const screens = page.getByRole("navigation", { name: "Tài khoản" });
  await expect(screens).toBeHidden();
  await account.click();
  await expect(page.getByText("@vy_tran")).toBeVisible();
  await expect(screens.getByRole("link")).toHaveText(["Hồ sơ", "Quyền riêng tư", "Cài đặt"]);

  // Trying the looks does not close the menu. A chosen look is on the page at once and after a reload.
  const looks = page.getByRole("group", { name: "Giao diện" });
  await expect(looks.getByRole("button", { name: "Tự động" })).toHaveAttribute("aria-pressed", "true");
  await looks.getByRole("button", { name: "Tối" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator("body")).toHaveCSS("background-color", "rgb(22, 15, 20)");
  await expect(screens).toBeVisible();
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");

  // "Tự động" follows the device, also when the device changes while the app is open.
  await account.click();
  await looks.getByRole("button", { name: "Tự động" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.emulateMedia({ colorScheme: "light" });

  // A choice closes the menu. The settings are a tab beside the profile and the privacy screen.
  await screens.getByRole("link", { name: "Cài đặt" }).click();
  await expect(page).toHaveURL(/\/me\/settings$/);
  await expect(screens).toBeHidden();
  await expect(page.getByRole("heading", { name: "Cài đặt", level: 1 })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Trong màn này" }).getByRole("link")).toHaveText(["Hồ sơ", "Quyền riêng tư", "Cài đặt"]);
  // Escape and a click elsewhere close it too.
  await account.click();
  await page.keyboard.press("Escape");
  await expect(screens).toBeHidden();

  // The same corner on a phone, and nothing wider than the screen with the menu open.
  await page.setViewportSize({ width: 390, height: 844 });
  await account.click();
  await expect(screens).toBeVisible();
  await expect.poll(async () => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.locator("details").filter({ has: screens }).getByRole("button", { name: "Đăng xuất" }).click();
  // Signed out in a browser, a person is back at the page that says what the app is, one press from sign-in.
  await expect(page.getByRole("heading", { level: 1, name: "Biết bạn bè đang làm gì. Hẹn nhau trong vài chạm." })).toBeVisible();
  await page.getByRole("link", { name: "Đăng nhập", exact: true }).click();
  await expect(page.getByLabel("Email của bạn")).toBeVisible();
});

test("settings: push says why it cannot be turned on here; deleting the account asks twice and says why the server refused", async ({ page }) => {
  await signIn(page);
  await page.route("**/rest/v1/**", route => route.fulfill({ json: new URL(route.request().url()).pathname.endsWith("/profiles") ? profile : [] }));
  let asked = 0;
  await page.route("**/functions/v1/delete-account", route => { asked++; return route.fulfill({ status: 409, json: { error: "transfer ownership of groups with other members first" } }); });
  await page.goto("/me/settings");

  await expect(page.getByRole("heading", { name: "Giao diện" })).toBeVisible();
  // This build has no push key, so the switch explains itself instead of failing.
  await expect(page.getByRole("heading", { name: "Thông báo đẩy" })).toBeVisible();
  await expect(page.getByText("Bản ứng dụng này chưa bật thông báo đẩy.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Bật thông báo đẩy" })).toBeDisabled();
  await expect(page.getByText("Đang đăng nhập bằng vy@example.test.")).toBeVisible();

  const remove = page.getByRole("button", { name: "Xóa tài khoản", exact: true });
  await expect(remove).toBeDisabled();
  await page.getByLabel("Xác nhận xóa tài khoản").fill("XÓA");
  await remove.click();
  const question = page.getByRole("alertdialog", { name: "Xóa tài khoản?" });
  await question.getByRole("button", { name: "Thôi" }).click();
  // While the dialog is still closing, its own button of the same name is the only one a reader can reach.
  await expect(question).toHaveCount(0);
  expect(asked).toBe(0);
  await remove.click();
  await question.getByRole("button", { name: "Xóa tài khoản" }).click();
  await expect(page.getByRole("alert")).toContainText("chuyển quyền chủ nhóm");
  expect(asked).toBe(1);
  // Still signed in: the refusal changed nothing.
  await expect(page.getByRole("heading", { name: "Cài đặt", level: 1 })).toBeVisible();
});

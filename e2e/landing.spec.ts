import { expect, test, type Page } from "@playwright/test";
import { signIn } from "./signedIn";

const vietnamese = /[À-ÖØ-öø-ÿĂăĐđĨĩŨũƠơƯưẠ-ỹ]/;
const fits = (page: Page) => expect.poll(async () => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
/** Nobody is signed in: the Auth server knows no session. */
const visitor = (page: Page) => page.route("**/auth/v1/**", route => route.fulfill({ json: {} }));
const title = "Biết bạn bè đang làm gì. Hẹn nhau trong vài chạm.";

test("public member, visit and request totals are recorded and refreshed every minute", async ({ page }) => {
  await page.clock.install({ time: new Date("2026-10-12T00:00:00Z") });
  await visitor(page);
  let visitsRecorded = 0;
  let refreshes = 0;
  let requestReads = 0;
  await page.route("**/api/public-request-count", route => {
    requestReads++;
    return route.fulfill({ json: { requests: String(requestReads === 1 ? 23_170 : 23_171) } });
  });
  await page.route("**/rest/v1/rpc/**", async route => {
    const request = route.request();
    const endpoint = new URL(request.url()).pathname.split("/").at(-1);
    const cors = {
      "access-control-allow-origin": "*",
      "access-control-allow-methods": "POST, OPTIONS",
      "access-control-allow-headers": "apikey, authorization, content-type, x-client-info, accept-profile, content-profile",
    };
    if (request.method() === "OPTIONS") return route.fulfill({ status: 204, headers: cors });
    if (endpoint === "record_public_landing_view") {
      visitsRecorded++;
      return route.fulfill({ status: 200, headers: cors, json: [{ total_users: 12, total_visits: 33 }] });
    }
    if (endpoint === "get_public_site_metrics") {
      refreshes++;
      return route.fulfill({ status: 200, headers: cors, json: [{ total_users: 13, total_visits: 34 }] });
    }
    return route.continue();
  });

  await page.goto("/");
  const panel = page.getByRole("region", { name: "Hoạt động cộng đồng" });
  await expect(panel.getByText("Lượt xem trang", { exact: true })).toBeVisible();
  await expect(panel.getByText("12", { exact: true })).toBeVisible();
  await expect(panel.getByText("33", { exact: true })).toBeVisible();
  await expect(panel.getByText(/≈ 23[.,]170/)).toBeVisible();
  expect(visitsRecorded).toBe(1);
  expect(requestReads).toBe(1);

  await page.clock.fastForward(60_001);
  await expect.poll(() => refreshes).toBe(1);
  await expect(panel.getByText("13", { exact: true })).toBeVisible();
  await expect(panel.getByText("34", { exact: true })).toBeVisible();
  await expect.poll(() => requestReads).toBe(2);
  await expect(panel.getByText(/≈ 23[.,]171/)).toBeVisible();
  expect(visitsRecorded).toBe(1);
});

test("a visitor is told what the app is with drawings, and is one tap from signing in", async ({ page }) => {
  await visitor(page);
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
  await expect(page.getByRole("img", { name: /Màn hình đầu tiên của ứng dụng/ })).toBeVisible();
  // The five parts, each under its own heading.
  for (const heading of ["Từ “đang làm gì đó?” tới lúc gặp nhau", "Năm màn hình ở thanh dưới, mỗi màn hình một việc", "Riêng tư là mặc định, chia sẻ là lựa chọn", "Cài lên màn hình chính, không cần cửa hàng ứng dụng", "Trước khi bắt đầu"]) {
    await expect(page.getByRole("heading", { level: 2, name: heading })).toBeVisible();
  }
  await expect(page.locator("#how").getByRole("listitem")).toHaveCount(3);
  await expect(page.locator("#features").getByRole("listitem")).toHaveCount(5);
  await expect(page.getByRole("img", { name: /Ba vòng tròn lồng nhau/ })).toBeVisible();
  // People who ask for less motion see every part and every line at once, without scrolling to it.
  expect(await page.locator("#questions").evaluate(node => getComputedStyle(node).opacity)).toBe("1");
  expect(await page.locator("#privacy .draw path").evaluate(node => getComputedStyle(node).strokeDashoffset)).toBe("0px");

  await page.getByRole("link", { name: "Xem ứng dụng làm gì" }).click();
  await expect(page).toHaveURL(/#how$/);
  await page.getByRole("link", { name: "Đăng nhập để bắt đầu" }).first().click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { name: "Chào bạn." })).toBeVisible();
  await page.getByRole("link", { name: "Ứng dụng này làm gì?" }).click();
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
});

for (const width of [320, 390]) {
  test(`on a phone ${width} px wide the first screen says what the app is and how to start, and nothing is wider than the screen`, async ({ page }) => {
    await page.setViewportSize({ width, height: 780 });
    await visitor(page);
    await page.goto("/");
    await expect(page.locator('meta[name="viewport"]')).toHaveAttribute("content", /maximum-scale=1(?:\.0)?, user-scalable=no/);
    // Sign-in is on the first screen twice: in the bar that stays at the top, and under the opening lines.
    await expect(page.getByRole("link", { name: "Đăng nhập", exact: true })).toBeInViewport();
    const start = page.getByRole("link", { name: "Đăng nhập để bắt đầu" }).first();
    await expect(start).toBeVisible();
    const box = (await start.boundingBox())!;
    expect(box.y + box.height).toBeLessThanOrEqual(780);
    await fits(page);
    await page.getByRole("heading", { level: 2, name: "Trước khi bắt đầu" }).scrollIntoViewIfNeeded();
    await page.getByText("Có mất tiền không?").click();
    await expect(page.getByText("Không. Ứng dụng miễn phí và không có quảng cáo.")).toBeVisible();
    await fits(page);
  });
}

test("with motion on, a part rises into place when it is scrolled to", async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: "no-preference" });
  const page = await context.newPage();
  await visitor(page);
  await page.goto("/");
  const part = page.locator("#questions");
  await expect(part).not.toHaveClass(/\bin\b/);
  await part.scrollIntoViewIfNeeded();
  await expect(part).toHaveClass(/\bin\b/);
  await expect(part).toHaveCSS("opacity", "1");
  await context.close();
});

test("a link into the app shows this page first and sign-in remembers where the link led; the installed app goes straight to sign-in", async ({ page }) => {
  await visitor(page);
  let asked: Record<string, unknown> = {};
  await page.route("**/auth/v1/otp**", async route => { asked = { ...route.request().postDataJSON(), to: new URL(route.request().url()).searchParams.get("redirect_to") }; await route.fulfill({ json: {} }); });
  await page.goto("/invite/group/sample-token");
  await expect(page.getByRole("heading", { level: 1, name: title })).toBeVisible();
  await expect(page.getByLabel("Email của bạn")).toHaveCount(0);
  await page.getByRole("link", { name: "Đăng nhập", exact: true }).click();
  await expect(page).toHaveURL(/\/login$/);
  await expect(page.getByRole("heading", { name: "Chào bạn." })).toBeVisible();
  // Loading the page again does not lose where the visitor was going, and the way back shows the page at that address.
  await page.reload();
  await page.getByRole("link", { name: "Ứng dụng này làm gì?" }).click();
  await expect(page).toHaveURL(/\/invite\/group\/sample-token$/);
  await page.getByRole("link", { name: "Đăng nhập để bắt đầu" }).last().click();
  await page.getByLabel("Email của bạn").fill("an@example.test");
  await page.getByRole("button", { name: "Gửi liên kết", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Đã gửi thư tới");
  expect(await page.evaluate(() => sessionStorage.getItem("gnouht-login-return-path"))).toBe("/invite/group/sample-token");
  expect(String(asked.to)).toMatch(/\/invite\/group\/sample-token$/);

  // Opened from the home screen: the browser reports the standalone display mode.
  await page.addInitScript(() => {
    const real = window.matchMedia.bind(window);
    window.matchMedia = query => query.includes("display-mode: standalone")
      ? { matches: true, media: query, onchange: null, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, dispatchEvent: () => false } as MediaQueryList
      : real(query);
  });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Chào bạn." })).toBeVisible();
  await expect(page.getByRole("link", { name: "Ứng dụng này làm gì?" })).toHaveCount(0);
});

test("the page in English has no Vietnamese left, and follows the dark look", async ({ page }) => {
  await page.addInitScript(() => { localStorage.setItem("gnouht-language", "en"); localStorage.setItem("gnouht-theme", "dark"); });
  await visitor(page);
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1, name: "Know what your friends are up to. Meet in a few taps." })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await expect(page.locator("body")).toHaveCSS("background-color", "rgb(22, 15, 20)");
  const texts = await page.evaluate(() => [
    ...document.body.innerText.split("\n"),
    ...[...document.querySelectorAll("[aria-label],[placeholder],[title]")].flatMap(node => ["aria-label", "placeholder", "title"].map(name => node.getAttribute(name) ?? "")),
  ].map(text => text.trim()).filter(Boolean));
  expect(texts.filter(text => vietnamese.test(text))).toEqual(["Tiếng Việt"]);
});

test("someone who is signed in gets the app at the front door, and has no sign-in page", async ({ page }) => {
  await signIn(page);
  await page.route("**/rest/v1/**", route => route.fulfill({ json: [] }));
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Mọi người đang làm gì?" })).toBeVisible();
  await page.goto("/login");
  await expect(page).toHaveURL(/\/$/);
  await expect(page.getByRole("heading", { name: "Mọi người đang làm gì?" })).toBeVisible();
});

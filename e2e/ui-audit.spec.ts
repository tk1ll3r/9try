import { expect, test } from "@playwright/test";
import { bareMap, signIn, user } from "./signedIn";

const routeValues: Record<string, string> = {
  bookId: "audit-book",
  conversationId: "audit-conversation",
  groupId: "99999999-9999-4999-8999-999999999999",
  meetupId: "88888888-8888-4888-8888-888888888888",
  momentId: "77777777-7777-4777-8777-777777777777",
  ownerId: "22222222-2222-4222-8222-222222222222",
  token: "audit-invite-token",
  userId: "22222222-2222-4222-8222-222222222222",
};

// Active product routes from src/app/modules.ts. The dormant expenses module is outside this UI audit.
const routePatterns = [
  "", "today", "calendar", "timetable", "free-time", "calendar/requests", "calendar/shared/:ownerId",
  "me/organizer", "habits", "notes", "chat", "chat/:conversationId", "chat/with/:userId", "chat/group/:groupId",
  "notifications", "me/friends", "me/relationships", "invite/friend/:token", "groups", "groups/:groupId", "invite/group/:token",
  "meetups", "meetups/:meetupId", "moments", "moments/archive", "moments/:userId", "moments/:userId/:momentId",
  "me/location", "stats", "feedback", "me", "me/privacy", "me/settings", "menu",
];
const registeredRoutes = routePatterns.map(path => path
  ? `/${path.replace(/:([^/]+)/g, (_, name: string) => routeValues[name] ?? "audit-id")}`
  : "/");

async function auditBackend(page: import("@playwright/test").Page) {
  await page.route("**/rest/v1/**", route => {
    const path = new URL(route.request().url()).pathname.replace(/^.*\/rest\/v1/, "");
    if (path === "/meetup_invitees") return route.fulfill({ json: [{ rsvp_status: "going", meetup: {
      id: routeValues.meetupId, group_id: null, organizer_id: user.id, title: "Audit meetup", description: "A sample activity for the route audit.",
      status: "proposed", start_at: null, end_at: null, capacity: null, location_name: null,
    } }] });
    if (path === "/profiles") return route.fulfill({ json: {
      id: user.id, display_name: "Vy", username: "vy", bio: "", timezone: "Asia/Ho_Chi_Minh", birthday: null, avatar_url: null,
    } });
    return route.fulfill({ json: [] });
  });
  await bareMap(page);
}

async function checkVisibleControls(page: import("@playwright/test").Page, path: string) {
  const audit = await page.evaluate(() => {
    const short = [...document.querySelectorAll<HTMLElement>("a, button, input, select, textarea, summary")].flatMap(element => {
    const box = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    if (!box.width || !box.height || style.visibility === "hidden" || Number(style.opacity) === 0 || element.closest(".sr-only") || (element as HTMLButtonElement).disabled) return [];
    if (element.closest("details:not([open])") && element.tagName !== "SUMMARY") return [];
    if (element.matches("input[type=checkbox], input[type=radio]") && (element.closest("label")?.getBoundingClientRect().height ?? 0) >= 44) return [];
    return box.height < 43.5
      ? [`${Math.round(box.width)}×${Math.round(box.height)} ${element.tagName.toLowerCase()} “${(element.getAttribute("aria-label") || element.textContent || "").trim().slice(0, 36)}”`]
      : [];
    });
    return { short, fits: document.documentElement.scrollWidth <= innerWidth };
  });
  return [...audit.short.map(item => `${path}: control under 44 px (${item})`), ...(!audit.fits ? [`${path}: horizontal overflow`] : [])];
}

test("every registered screen fits a touch phone and keeps its visible controls finger-sized", async ({ browser }, testInfo) => {
  test.slow();
  const context = await browser.newContext({
    baseURL: "http://127.0.0.1:5180",
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
    reducedMotion: "reduce",
  });
  const page = await context.newPage();
  const pageErrors: string[] = [];
  page.on("pageerror", error => pageErrors.push(error.message));
  try {
    await signIn(page);
    await auditBackend(page);
    expect(await page.evaluate(() => matchMedia("(pointer: coarse)").matches)).toBe(true);

    const issues: string[] = [];
    for (const path of registeredRoutes) {
      await page.goto(path);
      await expect(page.locator(".page-slot").getByRole("heading").first(), `screen did not render at ${path}`).toBeVisible();
      issues.push(...await checkVisibleControls(page, path));
    }

    // Narrow phones, a tablet, and a desktop width catch different wrapping and fixed-shell issues.
    for (const width of [320, 360, 430, 768, 1280]) {
      await page.setViewportSize({ width, height: width < 400 ? 740 : 900 });
      for (const path of ["/", "/calendar", "/chat", "/me/relationships", "/me/location", "/menu"]) {
        await page.goto(path);
        await expect(page.locator(".page-slot").getByRole("heading").first()).toBeVisible();
        if (!await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)) issues.push(`${width}px overflow on ${path}`);
      }
    }

    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/calendar");
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("calendar-mobile.png") });
    await page.goto("/chat");
    await expect(page.getByRole("heading", { name: "Trò chuyện" })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("chat-mobile.png") });
    await page.goto("/me/location");
    await expect(page.getByRole("heading", { name: "Bản đồ bạn bè" })).toBeVisible();
    await page.screenshot({ path: testInfo.outputPath("map-mobile.png") });

    expect(issues, "mobile controls and layouts need fixes").toEqual([]);
    expect(pageErrors, "uncaught browser errors during the route audit").toEqual([]);
  } finally {
    await context.close();
  }
});

test("mobile scrolling near the bottom does not snap back to the top", async ({ browser }) => {
  const context = await browser.newContext({
    baseURL: "http://127.0.0.1:5180",
    viewport: { width: 390, height: 844 },
    isMobile: true,
    hasTouch: true,
  });
  const page = await context.newPage();
  try {
    await signIn(page);
    await page.goto("/");
    await page.evaluate(() => {
      document.documentElement.style.minHeight = "2800px";
      window.scrollTo(0, 1800);
      window.visualViewport?.dispatchEvent(new Event("scroll"));
    });
    await expect.poll(() => page.evaluate(() => window.scrollY)).toBeGreaterThan(1500);
  } finally {
    await context.close();
  }
});

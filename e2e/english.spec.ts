import { expect, test, type Page } from "@playwright/test";
import { signIn, user } from "./signedIn";

const vietnamese = /[À-ÖØ-öø-ÿĂăĐđĨĩŨũƠơƯưẠ-ỹ]/;
const english = (page: Page) => page.addInitScript(() => localStorage.setItem("gnouht-language", "en"));

/** Every text a person can read or hear on the page: what is shown, and the labels, hints and titles of its parts. */
const texts = (page: Page) => page.evaluate(() => [
  ...document.body.innerText.split("\n"),
  ...[...document.querySelectorAll("[aria-label],[placeholder],[title]")].flatMap(node => ["aria-label", "placeholder", "title"].map(name => node.getAttribute(name) ?? "")),
].map(text => text.trim()).filter(Boolean));

test("the language is chosen on the sign-in screen and in the account menu, and kept on the device", async ({ page }) => {
  await page.route("**/auth/v1/**", route => route.fulfill({ json: {} }));
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Chào bạn." })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "vi");

  // Each language is offered under its own name. Choosing one loads the app again in it.
  await page.getByRole("group", { name: "Ngôn ngữ" }).getByRole("button", { name: "English" }).click();
  await expect(page.getByRole("heading", { name: "Hello." })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "en");
  await expect(page.getByRole("button", { name: "Send the link" })).toBeVisible();
  await expect(page.getByLabel("Your email")).toBeVisible();
  expect((await texts(page)).filter(text => vietnamese.test(text))).toEqual(["Tiếng Việt"]);

  // Signed in, the choice is still there, and the menu in the corner changes it back.
  await signIn(page);
  await page.route("**/rest/v1/**", route => route.fulfill({ json: new URL(route.request().url()).pathname.endsWith("/profiles")
    ? { id: user.id, display_name: "Vy", username: "vy", bio: "", timezone: "Asia/Ho_Chi_Minh", birthday: null } : [] }));
  await page.goto("/today");
  await expect(page.getByRole("heading", { name: "What is on today?" })).toBeVisible();
  await expect(page.getByRole("complementary").getByRole("navigation").getByRole("link"))
    .toHaveText(["Mode", "Today", "Calendar", "Tasks", "Chat", "Friends", "Groups", "Meetups", "Location", "Stats"]);
  await page.getByLabel("Account and settings").click();
  await expect(page.getByRole("navigation", { name: "Account" }).getByRole("link")).toHaveText(["Profile", "Privacy", "Settings"]);
  await page.getByRole("group", { name: "Language" }).getByRole("button", { name: "Tiếng Việt" }).click();
  await expect(page.getByRole("heading", { name: "Hôm nay mình có gì?" })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "vi");
});

test("in English no screen keeps Vietnamese text of its own, and dates are written the English way", async ({ page }) => {
  test.slow(); // eighteen screens, each loaded from the start
  await page.clock.setFixedTime(new Date(2026, 9, 8, 10, 0));
  await english(page);
  await signIn(page);
  // An account with nothing in it: whatever Vietnamese is on a screen then is the app's own text.
  await page.route("**/rest/v1/**", route => route.fulfill({ json: new URL(route.request().url()).pathname.endsWith("/profiles")
    ? { id: user.id, display_name: "Vy", username: "vy", bio: "", timezone: "Asia/Ho_Chi_Minh", birthday: null } : [] }));
  await page.route("https://tiles.openfreemap.org/**", route => route.fulfill({ json: { version: 8, sources: {}, layers: [] } }));

  const left: string[] = [];
  for (const path of ["/", "/today", "/calendar", "/timetable", "/free-time", "/me/organizer", "/habits", "/notes", "/chat", "/me/friends", "/groups", "/meetups", "/me/location", "/stats", "/notifications", "/me", "/me/privacy", "/me/settings"]) {
    await page.goto(path);
    await expect(page.getByRole("heading", { level: 1 })).toBeVisible();
    // Until its data is there a screen says so; wait for that to end.
    await expect(page.getByText(/^(Loading|Checking|Opening|Searching)/)).toHaveCount(0);
    left.push(...(await texts(page)).filter(text => vietnamese.test(text)).map(text => `${path}: ${text}`));
  }
  expect(left).toEqual([]);

  // The dialogs and the menu are text too.
  await page.goto("/calendar");
  await expect(page.getByRole("heading", { name: "October 2026" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Thursday, 8 October", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Add event", exact: true }).click();
  const form = page.getByRole("dialog", { name: "Add event" });
  await expect(form.getByLabel("Event name")).toBeFocused();
  expect((await texts(page)).filter(text => vietnamese.test(text))).toEqual([]);
  await page.keyboard.press("Escape");
  await page.getByLabel("Account and settings").click();
  expect((await texts(page)).filter(text => vietnamese.test(text))).toEqual(["Tiếng Việt"]);
});

test("in English a notification that the database wrote is read in English, and a typed timetable may use English days", async ({ page }) => {
  await english(page);
  await signIn(page);
  const stored: Record<string, unknown>[] = [];
  await page.route("**/rest/v1/**", route => {
    const request = route.request(); const url = new URL(request.url());
    if (url.pathname.endsWith("/notifications") && request.method() === "GET") return route.fulfill({ json: [
      { id: "n1", category: "friend_request", title: "Lời mời kết bạn", body: "Có người muốn kết nối với bạn.", action_path: "/me/friends", read_at: null, created_at: "2026-10-08T03:00:00Z" },
      { id: "n2", category: "meetup_invite", title: "Lời mời hoạt động", body: "Ăn tối cuối tuần", action_path: "/meetups", read_at: null, created_at: "2026-10-08T02:00:00Z" },
      { id: "n3", category: "chat_message", title: "Tin nhắn mới · Kha", body: "", action_path: "/chat/c1", read_at: null, created_at: "2026-10-08T01:00:00Z" }] });
    if (url.pathname.endsWith("/calendar_events")) {
      if (request.method() === "POST") { stored.push(request.postDataJSON()); return route.fulfill({ status: 201, json: { id: `class-${stored.length}` } }); }
      return route.fulfill({ json: [] });
    }
    return route.fulfill({ json: [] });
  });
  await page.goto("/notifications");
  // The fixed texts are translated; the name of a meetup, which a person wrote, is not.
  await expect(page.getByRole("button", { name: /^Friend requests\./ })).toContainText("Someone wants to connect with you.");
  await expect(page.getByRole("button", { name: /^Meetup invites\./ })).toContainText("Ăn tối cuối tuần");
  await expect(page.getByRole("button", { name: /^New message · Kha\./ })).toBeVisible();

  await page.goto("/timetable");
  await page.getByLabel("One class on each line").fill("Mon 07:30-09:45 Data structures @ B1.02\nThursday 13:00-15:15 Discrete maths");
  await expect(page.getByText("2 classes understood.")).toBeVisible();
  await page.getByRole("button", { name: /^Add 2 classes$/ }).click();
  await expect.poll(() => stored.length).toBe(2);
  expect(stored.map(row => [row.title, row.place ?? null, row.recurrence_rule])).toEqual([["Data structures", "B1.02", "weekly"], ["Discrete maths", null, "weekly"]]);
});

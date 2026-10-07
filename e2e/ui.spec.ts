import { test, expect, type Page } from "@playwright/test";

// A deterministic style exercises real WebGL + the bundled worker without
// depending on a public tile service. It is NOT evidence of actual tile delivery.
const fixtureStyle = { version: 8, sources: {}, layers: [{ id: "background", type: "background", paint: { "background-color": "#e9e5d7" } }] };
async function mockStyle(page: Page) {
  await page.route("https://tiles.openfreemap.org/**", route => route.fulfill({ json: fixtureStyle }));
}
async function loggedOut(page: Page) {
  // No local or cloud Auth requests are allowed to leave these UI tests.
  await page.route("**/auth/v1/**", route => route.fulfill({ json: {} }));
}

test("worker loads and two fictional markers render without Auth/GPS", async ({ page }) => {
  await mockStyle(page);
  const backend: string[] = []; const errors: string[] = []; const workers: number[] = [];
  page.on("request", request => { if (/\/(auth|rest|functions)\/v1\//.test(request.url())) backend.push(request.url()); });
  page.on("pageerror", error => errors.push(error.message));
  page.on("response", response => { if (/worker.*\.(?:js|mjs)/.test(response.url())) workers.push(response.status()); });
  await page.addInitScript(() => {
    navigator.geolocation.watchPosition = () => { throw new Error("Demo must not activate GPS"); };
    navigator.geolocation.getCurrentPosition = () => { throw new Error("Demo must not activate GPS"); };
  });
  await page.goto("/demo/location");
  await expect(page.getByTestId("map-container")).toHaveAttribute("data-map-state", "ready");
  await expect(page.locator(".maplibregl-marker")).toHaveCount(2);
  await page.getByRole("button", { name: "Ẩn Bình", exact: true }).click();
  await expect(page.locator(".maplibregl-marker")).toHaveCount(1);
  await page.getByRole("button", { name: "Hiện Bình", exact: true }).click();
  await expect(page.locator(".maplibregl-marker")).toHaveCount(2);
  expect(workers.length).toBeGreaterThan(0); expect(workers.every(status => status === 200)).toBe(true);
  expect(errors).toEqual([]); expect(backend).toEqual([]);
});

test("two independent fixture contexts do not share local viewer state", async ({ browser, baseURL }) => {
  const a = await browser.newContext(); const b = await browser.newContext();
  try {
    const pa = await a.newPage(); const pb = await b.newPage(); await mockStyle(pa); await mockStyle(pb);
    await Promise.all([pa.goto(`${baseURL}/demo/location`), pb.goto(`${baseURL}/demo/location`)]);
    await pb.getByRole("button", { name: "Xem như Bình", exact: true }).click();
    await expect(pa.getByTestId("demo-task")).toHaveText("An: chuẩn bị lịch cuối tuần");
    await expect(pb.getByTestId("demo-task")).toHaveText("Bình: xem các khung giờ hẹn");
  } finally { await a.close(); await b.close(); }
});

test("map failure has a retry that disposes and recreates the renderer", async ({ page }) => {
  let failed = true;
  await page.route("https://tiles.openfreemap.org/**", route => failed ? route.fulfill({ status: 503, body: "unavailable" }) : route.fulfill({ json: fixtureStyle }));
  await page.goto("/demo/location");
  await expect(page.getByRole("alert")).toContainText("Không tải được tài nguyên bản đồ");
  failed = false;
  await page.getByRole("button", { name: "Tải lại bản đồ", exact: true }).click();
  await expect(page.getByTestId("map-container")).toHaveAttribute("data-map-state", "ready");
  await expect(page.locator(".maplibregl-canvas")).toHaveCount(1);
  await expect(page.locator(".maplibregl-marker")).toHaveCount(2);
});

test("login communicates acceptance, preserves email and prevents repeated requests", async ({ page }) => {
  await loggedOut(page);
  let calls = 0; let submitted: Record<string, unknown> = {};
  await page.route("**/auth/v1/otp**", async route => {
    calls++; submitted = route.request().postDataJSON();
    await route.fulfill({ json: {} });
  });
  await page.goto("/invite/group/sample-token");
  await page.getByLabel("Email của bạn").fill("an@example.test");
  await page.getByRole("button", { name: "Gửi liên kết", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Yêu cầu đã được tiếp nhận");
  await expect(page.getByText("Phản hồi này chưa xác nhận email đã đến Gmail.", { exact: false })).toBeVisible();
  await expect(page.getByRole("button", { name: /Có thể gửi lại sau/ })).toBeDisabled();
  await page.getByLabel("Email của bạn").fill("binh@example.test");
  expect(calls).toBe(1); expect(submitted.email).toBe("an@example.test");
  expect(await page.evaluate(() => sessionStorage.getItem("gnouht-login-return-path"))).toBe("/invite/group/sample-token");
});

test("login quota failures are actionable, not successful delivery", async ({ page }) => {
  await loggedOut(page);
  await page.route("**/auth/v1/otp**", route => route.fulfill({ status: 429, json: { code: "over_email_send_rate_limit", msg: "rate limit" } }));
  await page.goto("/"); await page.getByLabel("Email của bạn").fill("an@example.test");
  await page.getByRole("button", { name: "Gửi liên kết", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("giới hạn gửi email");
  await expect(page.getByRole("button", { name: /Có thể gửi lại sau/ })).toBeDisabled();
});

test("sign-in works with the 6-digit code from the email", async ({ page }) => {
  const user = { id: "11111111-1111-4111-8111-111111111111", email: "vy@example.test", aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" };
  let verified: Record<string, unknown> = {};
  await page.route("**/auth/v1/**", route => {
    const url = route.request().url();
    if (url.includes("/auth/v1/verify")) {
      verified = route.request().postDataJSON();
      return route.fulfill({ json: { access_token: "mock-token", refresh_token: "mock-refresh", expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, token_type: "bearer", user } });
    }
    return route.fulfill({ json: url.includes("/auth/v1/user") ? user : {} });
  });
  await page.route("**/rest/v1/**", route => route.fulfill({ json: [] }));
  await page.goto("/");
  await page.getByLabel("Email của bạn").fill("vy@example.test");
  await page.getByRole("button", { name: "Gửi liên kết", exact: true }).click();
  await page.getByLabel("Mã 6 số trong email (nếu có)").fill("123456");
  await page.getByRole("button", { name: "Đăng nhập bằng mã", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Hôm nay mình có gì?" })).toBeVisible();
  expect(verified).toMatchObject({ email: "vy@example.test", token: "123456", type: "email" });
});

test("authenticated calendar uses a keyboard-accessible compact create dialog", async ({ page }) => {
  const user = { id: "11111111-1111-4111-8111-111111111111", email: "an@example.test", aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" };
  await page.addInitScript(account => {
    localStorage.setItem("sb-127-auth-token", JSON.stringify({ access_token: "mock-token", refresh_token: "mock-refresh", expires_at: Math.floor(Date.now() / 1000) + 3600, expires_in: 3600, token_type: "bearer", user: account }));
  }, user);
  await page.route("**/auth/v1/**", route => route.fulfill({ json: user }));
  await page.route("**/rest/v1/**", route => route.fulfill({ json: [] }));
  await page.goto("/calendar");
  await page.getByRole("heading", { name: "Lịch", exact: true }).waitFor();
  await page.getByRole("button", { name: "Thêm sự kiện", exact: true }).click();
  await expect(page.getByRole("dialog", { name: "Thêm sự kiện" })).toBeVisible();
  await expect(page.getByLabel("Tên sự kiện")).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog", { name: "Thêm sự kiện" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Thêm sự kiện", exact: true })).toBeFocused();
});

test("inbox opens an allowed notification target without fetching Home", async ({ page }) => {
  const user = { id: "11111111-1111-4111-8111-111111111111", email: "vy@example.test", aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" };
  await page.addInitScript(account => {
    localStorage.setItem("sb-127-auth-token", JSON.stringify({ access_token: "mock-token", refresh_token: "mock-refresh", expires_at: Math.floor(Date.now() / 1000) + 3600, expires_in: 3600, token_type: "bearer", user: account }));
  }, user);
  await page.route("**/auth/v1/**", route => route.fulfill({ json: user }));
  const requests: string[] = []; let unread = 1;
  await page.route("**/rest/v1/**", route => {
    const request = route.request(); const url = new URL(request.url()); requests.push(url.pathname);
    if (url.pathname.endsWith("/notifications")) {
      if (request.method() === "HEAD") return route.fulfill({ headers: { "content-range": `*/${unread}`, "access-control-expose-headers": "content-range", "access-control-allow-origin": "*" } });
      if (request.method() === "PATCH") { unread = 0; return route.fulfill({ json: [{ id: "n1" }] }); }
      return route.fulfill({ json: [{ id: "n1", title: "Lời mời", body: "Kha mời bạn", read_at: null, created_at: "2026-01-01T00:00:00Z", action_path: "/meetups" }] });
    }
    return route.fulfill({ json: [] });
  });
  await page.goto("/notifications");
  const badge = page.getByLabel("1 thông báo chưa đọc").filter({ visible: true });
  await expect(badge).toHaveText("1");
  await page.getByRole("button", { name: "Lời mời. Mở nội dung" }).click();
  await expect(page).toHaveURL(/\/meetups$/);
  await expect(badge).toHaveCount(0);
  expect(requests.some(path => path.endsWith("/calendar_events") || path.endsWith("/personal_tasks"))).toBe(false);
});

test("meetup detail errors offer retry and creating is serialized", async ({ page }) => {
  const user = { id: "11111111-1111-4111-8111-111111111111", email: "vy@example.test", aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" };
  await page.addInitScript(account => {
    localStorage.setItem("sb-127-auth-token", JSON.stringify({ access_token: "mock-token", refresh_token: "mock-refresh", expires_at: Math.floor(Date.now() / 1000) + 3600, expires_in: 3600, token_type: "bearer", user: account }));
  }, user);
  await page.route("**/auth/v1/**", route => route.fulfill({ json: user }));
  let pollUnavailable = true, createCalls = 0;
  await page.route("**/rest/v1/**", async route => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname.endsWith("/meetup_invitees")) return route.fulfill({ json: [{ rsvp_status: "pending", meetup: {
      id: "22222222-2222-4222-8222-222222222222", organizer_id: user.id, title: "Ăn tối", description: "", status: "proposed", timezone: "UTC", start_at: null, end_at: null, capacity: null, location_name: null, group_id: null,
    } }] });
    if (pathname.endsWith("/rpc/get_meetup_poll_summary") && pollUnavailable) return route.fulfill({ status: 400, json: { message: "Poll temporarily unavailable" } });
    if (pathname.endsWith("/rpc/create_meetup")) { createCalls++; await new Promise(resolve => setTimeout(resolve, 250)); return route.fulfill({ json: "33333333-3333-4333-8333-333333333333" }); }
    return route.fulfill({ json: [] });
  });
  await page.goto("/meetups");
  await expect(page.getByRole("alert")).toContainText("Poll temporarily unavailable");
  await expect(page.getByText("Chưa có khung giờ nào được đề xuất.")).toHaveCount(0);
  pollUnavailable = false;
  await page.getByRole("button", { name: "Thử lại", exact: true }).click();
  await expect(page.getByText("Chưa có khung giờ nào được đề xuất.")).toBeVisible();
  await page.getByRole("button", { name: "Tạo hoạt động" }).click();
  await page.getByRole("textbox", { name: "Tên hoạt động" }).fill("Đi dạo");
  const submit = page.getByRole("button", { name: "Tạo đề xuất", exact: true });
  await submit.dblclick();
  await expect(submit).toHaveCount(0);
  expect(createCalls).toBe(1);
});

test("group creation retains input on failure and prevents duplicate requests", async ({ page }) => {
  const user = { id: "11111111-1111-4111-8111-111111111111", email: "vy@example.test", aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" };
  await page.addInitScript(account => {
    localStorage.setItem("sb-127-auth-token", JSON.stringify({ access_token: "mock-token", refresh_token: "mock-refresh", expires_at: Math.floor(Date.now() / 1000) + 3600, expires_in: 3600, token_type: "bearer", user: account }));
  }, user);
  await page.route("**/auth/v1/**", route => route.fulfill({ json: user }));
  let attempts = 0;
  await page.route("**/rest/v1/**", async route => {
    if (new URL(route.request().url()).pathname.endsWith("/rpc/create_group")) {
      attempts++; await new Promise(resolve => setTimeout(resolve, 200));
      return attempts === 1 ? route.fulfill({ status: 400, json: { message: "Group unavailable" } }) : route.fulfill({ json: "22222222-2222-4222-8222-222222222222" });
    }
    return route.fulfill({ json: [] });
  });
  await page.goto("/groups");
  await page.getByRole("textbox", { name: "Tên nhóm" }).fill("Cuối tuần");
  const submit = page.getByRole("button", { name: "Tạo", exact: true });
  await submit.dblclick();
  await expect(page.getByRole("alert")).toContainText("Group unavailable");
  await expect(page.getByRole("textbox", { name: "Tên nhóm" })).toHaveValue("Cuối tuần");
  expect(attempts).toBe(1);
  await submit.click();
  await expect(page.getByRole("textbox", { name: "Tên nhóm" })).toHaveValue("");
  expect(attempts).toBe(2);
});

test("mobile Today exposes planner and coordination without extra tabs", async ({ page }) => {
  const user = { id: "11111111-1111-4111-8111-111111111111", email: "vy@example.test", aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" };
  await page.addInitScript(account => {
    localStorage.setItem("sb-127-auth-token", JSON.stringify({ access_token: "mock-token", refresh_token: "mock-refresh", expires_at: Math.floor(Date.now() / 1000) + 3600, expires_in: 3600, token_type: "bearer", user: account }));
  }, user);
  await page.route("**/auth/v1/**", route => route.fulfill({ json: user }));
  await page.route("**/rest/v1/**", route => route.fulfill({ json: [] }));
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await expect(page.getByRole("link", { name: "Đề xuất cuộc hẹn" })).toHaveAttribute("href", "/meetups");
  await expect(page.getByRole("link", { name: "Việc, ghi chú và thói quen" })).toHaveAttribute("href", "/me/organizer");
  await expect(page.getByRole("link", { name: "Bạn bè và lời mời" })).toHaveAttribute("href", "/me/friends");
  await expect(page.getByRole("link", { name: "Chia sẻ vị trí có thời hạn" })).toHaveAttribute("href", "/me/location");
  await expect.poll(async () => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("tasks: add once on Today, complete, undo, then edit and delete in the full list", async ({ page }) => {
  const user = { id: "11111111-1111-4111-8111-111111111111", email: "vy@example.test", aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" };
  await page.addInitScript(account => {
    localStorage.setItem("sb-127-auth-token", JSON.stringify({ access_token: "mock-token", refresh_token: "mock-refresh", expires_at: Math.floor(Date.now() / 1000) + 3600, expires_in: 3600, token_type: "bearer", user: account }));
  }, user);
  await page.route("**/auth/v1/**", route => route.fulfill({ json: user }));
  let tasks: Record<string, unknown>[] = []; let inserts = 0;
  await page.route("**/rest/v1/**", async route => {
    const request = route.request(); const url = new URL(request.url());
    if (!url.pathname.endsWith("/personal_tasks")) return route.fulfill({ json: [] });
    if (request.method() === "POST") {
      inserts++; await new Promise(resolve => setTimeout(resolve, 200));
      tasks = [{ id: "t1", ...request.postDataJSON(), completed_at: null }];
      return route.fulfill({ status: 201, body: "" });
    }
    if (request.method() === "PATCH") { tasks = tasks.map(task => ({ ...task, ...request.postDataJSON() })); return route.fulfill({ json: { id: "t1" } }); }
    if (request.method() === "DELETE") { tasks = []; return route.fulfill({ json: { id: "t1" } }); }
    if (url.searchParams.get("recurrence")?.startsWith("in.")) return route.fulfill({ json: [] }); // routines, not one-off tasks
    return route.fulfill({ json: url.searchParams.get("completed_at") === "is.null" ? tasks.filter(task => !task.completed_at) : tasks });
  });
  await page.goto("/");
  await page.getByLabel("Nội dung công việc").fill("Mua sách");
  await page.getByRole("button", { name: "Thêm việc", exact: true }).dblclick();
  const complete = page.getByRole("button", { name: "Hoàn thành: Mua sách" });
  await expect(complete).toBeVisible();
  expect(inserts).toBe(1);
  await expect(page.getByLabel("Nội dung công việc")).toHaveValue("");
  await complete.click();
  await expect(page.getByRole("status").filter({ hasText: "Đã hoàn thành việc." })).toBeVisible();
  await expect(complete).toHaveCount(0);
  await page.getByRole("button", { name: "Hoàn tác", exact: true }).click();
  await expect(complete).toBeVisible();

  await page.goto("/me/organizer");
  await page.getByRole("button", { name: "Sửa", exact: true }).click();
  await page.getByLabel("Tên việc").fill("Mua vở");
  await page.getByRole("button", { name: "Lưu thay đổi", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Mua vở" })).toBeVisible();
  await page.getByRole("button", { name: "Xóa: Mua vở" }).click();
  await page.getByRole("button", { name: "Xóa vĩnh viễn", exact: true }).click();
  await expect(page.getByText("Không có công việc phù hợp bộ lọc.")).toBeVisible();
});

test("friend removal requires confirmation", async ({ page }) => {
  const user = { id: "11111111-1111-4111-8111-111111111111", email: "vy@example.test", aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" };
  await page.addInitScript(account => {
    localStorage.setItem("sb-127-auth-token", JSON.stringify({ access_token: "mock-token", refresh_token: "mock-refresh", expires_at: Math.floor(Date.now() / 1000) + 3600, expires_in: 3600, token_type: "bearer", user: account }));
  }, user);
  await page.route("**/auth/v1/**", route => route.fulfill({ json: user }));
  let removed = 0;
  await page.route("**/rest/v1/**", route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/rpc/list_friend_connections")) return route.fulfill({ json: [{ user_id: "22222222-2222-4222-8222-222222222222", display_name: "Kha", username: "kha", status: "accepted", direction: "incoming", created_at: "2026-01-01T00:00:00Z" }] });
    if (path.endsWith("/rpc/remove_friend")) { removed++; return route.fulfill({ json: null }); }
    return route.fulfill({ json: [] });
  });
  await page.goto("/me/friends");
  await expect(page.getByText("Kha", { exact: true })).toBeVisible();
  page.once("dialog", dialog => dialog.dismiss());
  await page.getByRole("button", { name: "Xóa", exact: true }).click();
  expect(removed).toBe(0);
  page.once("dialog", dialog => dialog.accept());
  await page.getByRole("button", { name: "Xóa", exact: true }).click();
  await expect.poll(() => removed).toBe(1);
});

test("a friend link is created, then makes its visitor a friend", async ({ page }) => {
  const user = { id: "11111111-1111-4111-8111-111111111111", email: "vy@example.test", aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" };
  await page.addInitScript(account => {
    localStorage.setItem("sb-127-auth-token", JSON.stringify({ access_token: "mock-token", refresh_token: "mock-refresh", expires_at: Math.floor(Date.now() / 1000) + 3600, expires_in: 3600, token_type: "bearer", user: account }));
  }, user);
  await page.route("**/auth/v1/**", route => route.fulfill({ json: user }));
  let claimed = "";
  await page.route("**/rest/v1/**", route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/rpc/create_friend_invite")) return route.fulfill({ json: [{ token: "abc123", expires_at: "2026-10-14T00:00:00Z" }] });
    if (path.endsWith("/rpc/claim_friend_invite")) { claimed = route.request().postDataJSON().p_token; return route.fulfill({ json: "22222222-2222-4222-8222-222222222222" }); }
    return route.fulfill({ json: [] });
  });
  await page.goto("/me/friends");
  await page.getByRole("button", { name: "Tạo liên kết kết bạn" }).click();
  await expect(page.getByLabel("Liên kết kết bạn")).toHaveValue(/\/invite\/friend\/abc123$/);
  await page.goto("/invite/friend/abc123");
  await expect(page.getByRole("heading", { name: "Hai bạn đã là bạn bè" })).toBeVisible();
  expect(claimed).toBe("abc123");
});

for (const width of [320, 390, 768, 1280]) {
  test(`demo and login fit viewport ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 900 }); await mockStyle(page); await loggedOut(page);
    for (const route of ["/demo/location", "/"]) {
      await page.goto(route);
      await expect(page.getByRole("heading").first()).toBeVisible();
      await expect.poll(async () => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    }
  });
}

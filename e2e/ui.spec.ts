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
  await expect(page.getByRole("link", { name: "Việc cần làm và nhắc việc" })).toHaveAttribute("href", "/me/organizer");
  await expect(page.getByRole("link", { name: "Thói quen", exact: true })).toHaveAttribute("href", "/habits");
  await expect(page.getByRole("link", { name: "Ghi chú", exact: true })).toHaveAttribute("href", "/notes");
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

test("habits: mark done, see the streak, take it back; notes: found without Vietnamese marks", async ({ page }) => {
  const user = { id: "11111111-1111-4111-8111-111111111111", email: "vy@example.test", aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" };
  await page.addInitScript(account => {
    localStorage.setItem("sb-127-auth-token", JSON.stringify({ access_token: "mock-token", refresh_token: "mock-refresh", expires_at: Math.floor(Date.now() / 1000) + 3600, expires_in: 3600, token_type: "bearer", user: account }));
  }, user);
  await page.route("**/auth/v1/**", route => route.fulfill({ json: user }));
  const day = (offset: number) => new Date(Date.now() + offset * 86_400_000).toISOString().slice(0, 10); // the profile below is on UTC
  let done = [day(-1), day(-2)];
  const calls: string[] = [];
  await page.route("**/rest/v1/**", route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/personal_tasks")) return route.fulfill({ json: [{ id: "h1", title: "Đọc 20 phút", recurrence: "daily" }] });
    if (path.endsWith("/profiles")) return route.fulfill({ json: { timezone: "UTC" } });
    if (path.endsWith("/routine_completions")) return route.fulfill({ json: done.map(date => ({ task_id: "h1", completion_date: date })) });
    if (path.endsWith("/rpc/complete_routine")) { calls.push("done"); done = [day(0), ...done]; return route.fulfill({ json: day(0) }); }
    if (path.endsWith("/rpc/undo_routine_completion")) { calls.push("undo"); done = done.filter(date => date !== day(0)); return route.fulfill({ json: null }); }
    if (path.endsWith("/personal_notes")) return route.fulfill({ json: [
      { id: "n1", title: "Họp nhóm đồ án", body: "Phòng B4.14", updated_at: "2026-10-01T00:00:00Z" },
      { id: "n2", title: "Mua sách", body: "", updated_at: "2026-09-30T00:00:00Z" },
    ] });
    return route.fulfill({ json: [] });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/habits");
  const habit = page.getByRole("button", { name: /^Đọc 20 phút/ });
  await expect(habit).toHaveAttribute("aria-pressed", "false");
  await expect(page.getByText("2 ngày liên tiếp")).toBeVisible();
  await habit.click();
  await expect(habit).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByText("3 ngày liên tiếp")).toBeVisible();
  await habit.click();
  await expect(habit).toHaveAttribute("aria-pressed", "false");
  expect(calls).toEqual(["done", "undo"]);
  await expect.poll(async () => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

  await page.getByRole("link", { name: "Ghi chú", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Mua sách" })).toBeVisible();
  await page.getByLabel("Tìm ghi chú").fill("hop nhom");
  await expect(page.getByRole("heading", { name: "Họp nhóm đồ án" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Mua sách" })).toHaveCount(0);
});

test("privacy screen gathers what each feature shares and stops it in place", async ({ page }) => {
  const user = { id: "11111111-1111-4111-8111-111111111111", email: "vy@example.test", aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" };
  await page.addInitScript(account => {
    localStorage.setItem("sb-127-auth-token", JSON.stringify({ access_token: "mock-token", refresh_token: "mock-refresh", expires_at: Math.floor(Date.now() / 1000) + 3600, expires_in: 3600, token_type: "bearer", user: account }));
  }, user);
  await page.route("**/auth/v1/**", route => route.fulfill({ json: user }));
  const kha = "22222222-2222-4222-8222-222222222222";
  const later = new Date(Date.now() + 3_600_000).toISOString();
  let busyShared = true, modeOn = true, sessionOpen = true;
  await page.route("**/rest/v1/**", route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/rpc/list_friend_connections")) return route.fulfill({ json: [{ user_id: kha, display_name: "Kha", username: "kha", status: "accepted", direction: "incoming", created_at: "2026-01-01T00:00:00Z" }] });
    if (path.endsWith("/availability_shares")) return route.fulfill({ json: busyShared ? [{ user_id: kha }] : [] });
    if (path.endsWith("/rpc/set_user_availability_share")) { busyShared = false; return route.fulfill({ json: null }); }
    if (path.endsWith("/rpc/list_blocked_users")) return route.fulfill({ json: [{ user_id: "33333333-3333-4333-8333-333333333333", display_name: "Spam", username: "spam" }] });
    if (path.endsWith("/activity_modes")) return route.fulfill({ json: modeOn ? [{ user_id: user.id, mode: "studying", expires_at: later }] : [] });
    if (path.endsWith("/rpc/set_my_activity_mode")) { modeOn = false; return route.fulfill({ json: null }); }
    if (path.endsWith("/location_sessions")) return route.fulfill({ json: sessionOpen ? [{ id: "s1", expires_at: later, approximate: true }] : [] });
    if (path.endsWith("/rpc/stop_location_session")) { sessionOpen = false; return route.fulfill({ json: null }); }
    if (path.endsWith("/calendar_events")) return route.fulfill({ json: [{ id: "e1", visibility: "selected_friends" }, { id: "e2", visibility: "only_me" }] });
    return route.fulfill({ json: [] });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/me/privacy");
  await expect(page.getByText("1 sự kiện đang hiện cho những người bạn bạn đã chọn")).toBeVisible();
  await expect(page.getByText("Đã chặn 1 người.")).toBeVisible();

  await page.getByRole("button", { name: "Ngừng chia sẻ", exact: true }).click();
  await expect(page.getByText("Bạn không chia sẻ lịch bận/rảnh với ai.")).toBeVisible();
  await page.getByRole("button", { name: "Tắt mode", exact: true }).click();
  await expect(page.getByText("Bạn không bật mode nào.")).toBeVisible();
  const location = page.locator("section", { hasText: "Mở bản đồ" });
  await expect(location.getByText("thấy vị trí gần đúng của bạn")).toBeVisible();
  await location.getByRole("button", { name: "Dừng chia sẻ" }).click();
  await expect(page.getByText("Bạn không chia sẻ vị trí với ai.")).toBeVisible();
  expect([busyShared, modeOn, sessionOpen]).toEqual([false, false, false]);
  await expect.poll(async () => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("search finds a note by its body without marks, and a screen by name", async ({ page }) => {
  const user = { id: "11111111-1111-4111-8111-111111111111", email: "vy@example.test", aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" };
  await page.addInitScript(account => {
    localStorage.setItem("sb-127-auth-token", JSON.stringify({ access_token: "mock-token", refresh_token: "mock-refresh", expires_at: Math.floor(Date.now() / 1000) + 3600, expires_in: 3600, token_type: "bearer", user: account }));
  }, user);
  await page.route("**/auth/v1/**", route => route.fulfill({ json: user }));
  await page.route("**/rest/v1/**", route => new URL(route.request().url()).pathname.endsWith("/personal_notes")
    ? route.fulfill({ json: [{ id: "n1", title: "Họp nhóm đồ án", body: "Phòng B4.14, mang máy chiếu", updated_at: "2026-10-01T00:00:00Z" }] })
    : route.fulfill({ json: [] }));
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Hôm nay mình có gì?" })).toBeVisible();
  await page.keyboard.press("Control+k");
  const dialog = page.getByRole("dialog", { name: "Tìm kiếm" });
  const field = dialog.getByLabel("Từ khóa");
  await expect(field).toBeFocused();
  await field.fill("may chieu");
  await expect(dialog.getByRole("button", { name: /Họp nhóm đồ án/ })).toBeVisible();
  await field.fill("khong co gi nhu the");
  await expect(dialog.getByText("Không thấy gì khớp.")).toBeVisible();
  await field.fill("thoi quen");
  await field.press("Enter");
  await expect(page).toHaveURL(/\/habits$/);
  await expect(dialog).toHaveCount(0);

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Tìm kiếm" }).click();
  await expect(page.getByRole("dialog", { name: "Tìm kiếm" })).toBeVisible();
});

test("calendar feed link is shown once when created and is revoked from the privacy screen", async ({ page }) => {
  const user = { id: "11111111-1111-4111-8111-111111111111", email: "vy@example.test", aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" };
  await page.addInitScript(account => {
    localStorage.setItem("sb-127-auth-token", JSON.stringify({ access_token: "mock-token", refresh_token: "mock-refresh", expires_at: Math.floor(Date.now() / 1000) + 3600, expires_in: 3600, token_type: "bearer", user: account }));
  }, user);
  await page.route("**/auth/v1/**", route => route.fulfill({ json: user }));
  let createdAt: string | null = null;
  await page.route("**/rest/v1/**", route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/calendar_feeds")) return route.fulfill({ json: createdAt ? [{ created_at: createdAt }] : [] });
    if (path.endsWith("/rpc/create_calendar_feed")) { createdAt = "2026-10-07T00:00:00Z"; return route.fulfill({ json: "a".repeat(64) }); }
    if (path.endsWith("/rpc/revoke_calendar_feed")) { createdAt = null; return route.fulfill({ json: null }); }
    return route.fulfill({ json: [] });
  });
  await page.goto("/calendar");
  await page.getByRole("button", { name: "Liên kết lịch", exact: true }).click();
  await page.getByRole("button", { name: "Tạo liên kết lịch", exact: true }).click();
  await expect(page.getByRole("textbox", { name: "Liên kết lịch" })).toHaveValue(/\/functions\/v1\/calendar-feed\?token=a{64}$/);
  await expect(page.getByText("Đang có một liên kết")).toHaveCount(0);

  await page.goto("/me/privacy");
  await expect(page.getByText("Một liên kết lịch đang hoạt động.")).toBeVisible();
  await page.getByRole("button", { name: "Thu hồi liên kết", exact: true }).click();
  await expect(page.getByText("Một liên kết lịch đang hoạt động.")).toHaveCount(0);
  expect(createdAt).toBeNull();
});

test("Today gathers what needs an answer, what comes next and the day's habits, each answered in place", async ({ page }) => {
  const user = { id: "11111111-1111-4111-8111-111111111111", email: "vy@example.test", aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" };
  await page.addInitScript(account => {
    localStorage.setItem("sb-127-auth-token", JSON.stringify({ access_token: "mock-token", refresh_token: "mock-refresh", expires_at: Math.floor(Date.now() / 1000) + 3600, expires_in: 3600, token_type: "bearer", user: account }));
  }, user);
  await page.route("**/auth/v1/**", route => route.fulfill({ json: user }));
  const kha = "22222222-2222-4222-8222-222222222222";
  const tomorrow = (hour: number) => { const date = new Date(); date.setDate(date.getDate() + 1); date.setHours(hour, 0, 0, 0); return date.toISOString(); };
  const meetup = (id: string, title: string, status: string, start: string | null, end: string | null) => ({ id, organizer_id: kha, title, description: "", status, timezone: "UTC", start_at: start, end_at: end, capacity: null, location_name: null, group_id: null });
  let friendship = "pending", coffee = "pending", habitDone = false;
  await page.route("**/rest/v1/**", route => {
    const url = new URL(route.request().url()); const path = url.pathname;
    if (path.endsWith("/rpc/list_friend_connections")) return route.fulfill({ json: [{ user_id: kha, display_name: "Kha", username: "kha", status: friendship, direction: "incoming", created_at: "2026-01-01T00:00:00Z" }] });
    if (path.endsWith("/rpc/respond_friend_request")) { friendship = "accepted"; return route.fulfill({ json: null }); }
    if (path.endsWith("/meetup_invitees")) return route.fulfill({ json: [
      { rsvp_status: coffee, meetup: meetup("m1", "Cà phê sáng", "proposed", null, null) },
      { rsvp_status: "going", meetup: meetup("m2", "Học nhóm", "confirmed", tomorrow(9), tomorrow(11)) },
    ] });
    if (path.endsWith("/rpc/respond_meetup_rsvp")) { coffee = "going"; return route.fulfill({ json: null }); }
    if (path.endsWith("/personal_tasks")) return route.fulfill({ json: url.searchParams.get("recurrence")?.startsWith("in.") ? [{ id: "h1", title: "Đọc 20 phút", recurrence: "daily" }] : [] });
    if (path.endsWith("/profiles")) return route.fulfill({ json: { id: user.id, display_name: "Vy", username: "vy", timezone: "UTC", bio: "", birthday: null } });
    if (path.endsWith("/routine_completions")) return route.fulfill({ json: habitDone ? [{ task_id: "h1", completion_date: new Date().toISOString().slice(0, 10) }] : [] });
    if (path.endsWith("/rpc/complete_routine")) { habitDone = true; return route.fulfill({ json: null }); }
    if (path.endsWith("/activity_modes")) return route.fulfill({ json: [{ user_id: kha, mode: "studying", expires_at: tomorrow(9) }] });
    return route.fulfill({ json: [] });
  });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");

  const next = page.locator("section", { hasText: "Sắp tới" });
  await expect(next.getByRole("link", { name: /Học nhóm/ })).toContainText("Hoạt động");
  await expect(page.getByRole("heading", { name: "Lời mời kết bạn · 1" })).toBeVisible();
  await page.getByRole("button", { name: "Chấp nhận Kha" }).click();
  await expect(page.getByRole("heading", { name: /Lời mời kết bạn/ })).toHaveCount(0);

  await page.getByRole("button", { name: "Đi: Cà phê sáng", exact: true }).click();
  await expect(page.getByRole("heading", { name: /Lời mời hoạt động/ })).toHaveCount(0);

  await expect(page.getByRole("heading", { name: "Thói quen · còn 1" })).toBeVisible();
  await page.getByRole("button", { name: /^Đọc 20 phút/ }).click();
  await expect(page.getByRole("heading", { name: "Thói quen · xong hết" })).toBeVisible();

  const now = page.locator("section", { hasText: "Bạn bè lúc này" });
  await expect(now.getByText("Kha")).toBeVisible();
  await expect(now.getByText("Học bài")).toBeVisible();
  expect([friendship, coffee, habitDone]).toEqual(["accepted", "going", true]);
  await expect.poll(async () => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("a task typed with a hashtag gets a label, and the full list groups and filters by it", async ({ page }) => {
  const user = { id: "11111111-1111-4111-8111-111111111111", email: "vy@example.test", aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" };
  await page.addInitScript(account => {
    localStorage.setItem("sb-127-auth-token", JSON.stringify({ access_token: "mock-token", refresh_token: "mock-refresh", expires_at: Math.floor(Date.now() / 1000) + 3600, expires_in: 3600, token_type: "bearer", user: account }));
  }, user);
  await page.route("**/auth/v1/**", route => route.fulfill({ json: user }));
  const tasks: Record<string, unknown>[] = [{ id: "t0", title: "Mua vở", priority: "medium", due_at: null, completed_at: null, tags: [] }];
  await page.route("**/rest/v1/**", route => {
    const request = route.request(); const url = new URL(request.url());
    if (!url.pathname.endsWith("/personal_tasks") || url.searchParams.get("recurrence")?.startsWith("in.")) return route.fulfill({ json: [] });
    if (request.method() === "POST") { tasks.push({ id: "t1", completed_at: null, ...request.postDataJSON() }); return route.fulfill({ status: 201, body: "" }); }
    return route.fulfill({ json: tasks });
  });
  await page.goto("/");
  await page.getByLabel("Nội dung công việc").fill("Nộp bài tập #GiảiTích");
  await page.getByLabel("Giờ (tùy chọn)").fill("23:58");
  await page.getByRole("button", { name: "Thêm việc", exact: true }).click();
  await expect(page.getByRole("button", { name: "Hoàn thành: Nộp bài tập" })).toContainText("#giảitích");
  await expect(page.getByRole("button", { name: "Hoàn thành: Nộp bài tập" })).toContainText("23:58");
  expect(tasks[1]).toMatchObject({ title: "Nộp bài tập", tags: ["giảitích"] });
  const due = new Date(tasks[1].due_at as string);
  expect([due.getHours(), due.getMinutes()]).toEqual([23, 58]);

  await page.goto("/me/organizer");
  await expect(page.getByRole("region", { name: "Hôm nay" }).getByRole("heading", { name: "Nộp bài tập" })).toBeVisible();
  await expect(page.getByRole("region", { name: "Không hạn" }).getByRole("heading", { name: "Mua vở" })).toBeVisible();
  await page.getByRole("button", { name: "#giảitích", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Mua vở" })).toHaveCount(0);
  await page.getByRole("button", { name: "Sửa", exact: true }).click();
  await expect(page.getByLabel("Tên việc")).toHaveValue("Nộp bài tập #giảitích");
});

test("the inbox marks everything read at once", async ({ page }) => {
  const user = { id: "11111111-1111-4111-8111-111111111111", email: "vy@example.test", aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" };
  await page.addInitScript(account => {
    localStorage.setItem("sb-127-auth-token", JSON.stringify({ access_token: "mock-token", refresh_token: "mock-refresh", expires_at: Math.floor(Date.now() / 1000) + 3600, expires_in: 3600, token_type: "bearer", user: account }));
  }, user);
  await page.route("**/auth/v1/**", route => route.fulfill({ json: user }));
  let unread = 2; const patches: string[] = [];
  await page.route("**/rest/v1/**", route => {
    const request = route.request(); const url = new URL(request.url());
    if (!url.pathname.endsWith("/notifications")) return route.fulfill({ json: [] });
    if (request.method() === "HEAD") return route.fulfill({ headers: { "content-range": `*/${unread}`, "access-control-expose-headers": "content-range", "access-control-allow-origin": "*" } });
    if (request.method() === "PATCH") { unread = 0; patches.push(url.search); return route.fulfill({ status: 204, body: "" }); }
    return route.fulfill({ json: ["n1", "n2"].map(id => ({ id, title: `Thông báo ${id}`, body: "", read_at: null, created_at: "2026-01-01T00:00:00Z", action_path: null })) });
  });
  await page.goto("/notifications");
  await expect(page.getByRole("heading", { name: "Trung tâm thông báo · 2 chưa đọc" })).toBeVisible();
  await page.getByRole("button", { name: "Đánh dấu đã đọc hết" }).click();
  await expect(page.getByRole("heading", { name: "Trung tâm thông báo · 0 chưa đọc" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Đánh dấu đã đọc hết" })).toHaveCount(0);
  expect(patches).toHaveLength(1);
  expect(patches[0]).toContain("read_at=is.null");
  expect(patches[0]).toContain(`user_id=eq.${user.id}`);
  expect(patches[0]).not.toContain("id=eq.n");
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

test("chat: open a conversation, read it and send one message", async ({ page }) => {
  const user = { id: "11111111-1111-4111-8111-111111111111", email: "vy@example.test", aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" };
  await page.addInitScript(account => {
    localStorage.setItem("sb-127-auth-token", JSON.stringify({ access_token: "mock-token", refresh_token: "mock-refresh", expires_at: Math.floor(Date.now() / 1000) + 3600, expires_in: 3600, token_type: "bearer", user: account }));
  }, user);
  await page.route("**/auth/v1/**", route => route.fulfill({ json: user }));
  const messages = [{ id: "m1", sender_id: "22222222-2222-4222-8222-222222222222", sender_name: "Kha", body: "Đi cà phê không?", created_at: "2026-10-07T01:00:00Z" }];
  let sends = 0, reads = 0;
  await page.route("**/rest/v1/**", route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/rpc/list_conversations")) return route.fulfill({ json: [{ id: "c1", kind: "direct", title: "Kha", last_message_at: "2026-10-07T01:00:00Z", last_message_body: messages[messages.length - 1].body, unread_count: reads ? 0 : 1 }] });
    if (path.endsWith("/rpc/list_messages")) return route.fulfill({ json: [...messages].reverse() });
    if (path.endsWith("/rpc/mark_conversation_read")) { reads++; return route.fulfill({ json: null }); }
    if (path.endsWith("/rpc/send_message")) {
      sends++; const sent = route.request().postDataJSON();
      messages.push({ id: sent.p_id, sender_id: user.id, sender_name: "Vy", body: sent.p_body, created_at: new Date().toISOString() });
      return route.fulfill({ json: null });
    }
    return route.fulfill({ json: [] });
  });
  await page.goto("/chat");
  await expect(page.getByLabel("1 tin nhắn chưa đọc").filter({ visible: true })).toHaveCount(1);
  await page.getByRole("link", { name: /Kha/ }).click();
  await expect(page.getByText("Đi cà phê không?").first()).toBeVisible();
  await expect.poll(() => reads).toBeGreaterThan(0);
  await expect(page.getByLabel("1 tin nhắn chưa đọc")).toHaveCount(0);
  await page.getByLabel("Tin nhắn", { exact: true }).fill("Đi chứ");
  await page.getByRole("button", { name: "Gửi tin nhắn" }).click();
  await expect(page.getByText("Đi chứ").first()).toBeVisible();
  await expect(page.getByLabel("Tin nhắn", { exact: true })).toHaveValue("");
  expect(sends).toBe(1);
});

test("location: share with a chosen friend, publish a position, stop from another screen", async ({ page, context }) => {
  const user = { id: "11111111-1111-4111-8111-111111111111", email: "vy@example.test", aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" };
  const kha = "22222222-2222-4222-8222-222222222222";
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation({ latitude: 10.7725, longitude: 106.698 });
  await page.addInitScript(account => {
    localStorage.setItem("sb-127-auth-token", JSON.stringify({ access_token: "mock-token", refresh_token: "mock-refresh", expires_at: Math.floor(Date.now() / 1000) + 3600, expires_in: 3600, token_type: "bearer", user: account }));
  }, user);
  await page.route("**/auth/v1/**", route => route.fulfill({ json: user }));
  await mockStyle(page);
  const inAnHour = new Date(Date.now() + 3_600_000).toISOString();
  let started: Record<string, unknown> = {}; let published = 0, stopped = 0, active = false;
  await page.route("**/rest/v1/**", route => {
    const request = route.request(); const path = new URL(request.url()).pathname;
    if (path.endsWith("/rpc/list_friend_connections")) return route.fulfill({ json: [{ user_id: kha, display_name: "Kha", username: "kha", status: "accepted", direction: "incoming", created_at: "2026-01-01T00:00:00Z" }] });
    if (path.endsWith("/rpc/list_visible_locations")) return route.fulfill({ json: [{ session_id: "s9", owner_id: kha, owner_display_name: "Kha", owner_username: "kha", expires_at: inAnHour, approximate: false, latitude: 10.776, longitude: 106.703, accuracy_m: 8, recorded_at: new Date().toISOString() }] });
    if (path.endsWith("/rpc/start_location_session_for")) { started = request.postDataJSON(); active = true; return route.fulfill({ json: "s1" }); }
    if (path.endsWith("/rpc/stop_location_session")) { stopped++; active = false; return route.fulfill({ json: null }); }
    if (path.endsWith("/location_positions")) { published++; return route.fulfill({ status: 201, body: "" }); }
    if (path.endsWith("/location_sessions")) return route.fulfill({ json: active ? [{ id: "s1", expires_at: inAnHour, approximate: false }] : [] });
    return route.fulfill({ json: [] });
  });
  await page.goto("/me/location");
  await expect(page.locator(".maplibregl-marker")).toHaveCount(1);
  await expect(page.getByText("Đang cập nhật")).toBeVisible();
  await page.getByLabel("Kha", { exact: true }).check();
  await page.getByRole("button", { name: "Bắt đầu chia sẻ" }).click();
  await expect.poll(() => published).toBeGreaterThan(0);
  expect(started).toMatchObject({ p_recipient_ids: [kha], p_duration_minutes: 60, p_approximate: false });
  // The session keeps running on other screens, where the banner offers to stop it.
  await page.getByRole("link", { name: "Hôm nay" }).filter({ visible: true }).click();
  await page.getByRole("button", { name: "Dừng chia sẻ" }).click();
  await expect.poll(() => stopped).toBe(1);
  await expect(page.getByRole("button", { name: "Dừng chia sẻ" })).toHaveCount(0);
});

test("timetable: paste two classes and see them by weekday", async ({ page }) => {
  const user = { id: "11111111-1111-4111-8111-111111111111", email: "vy@example.test", aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" };
  await page.addInitScript(account => {
    localStorage.setItem("sb-127-auth-token", JSON.stringify({ access_token: "mock-token", refresh_token: "mock-refresh", expires_at: Math.floor(Date.now() / 1000) + 3600, expires_in: 3600, token_type: "bearer", user: account }));
  }, user);
  await page.route("**/auth/v1/**", route => route.fulfill({ json: user }));
  const stored: Record<string, unknown>[] = [];
  await page.route("**/rest/v1/**", route => {
    const request = route.request(); const url = new URL(request.url());
    if (!url.pathname.endsWith("/calendar_events")) return route.fulfill({ json: [] });
    if (request.method() === "POST") { stored.push({ id: `class-${stored.length + 1}`, ...request.postDataJSON() }); return route.fulfill({ status: 201, json: { id: `class-${stored.length}` } }); }
    return route.fulfill({ json: url.searchParams.get("category") === "eq.class" ? stored : [] });
  });
  await page.goto("/timetable");
  await page.getByLabel("Mỗi dòng một lớp").fill("T2 07:30-09:45 Cấu trúc dữ liệu @ B1.02\nT5 13:00-15:15 Toán rời rạc\nT9 sai");
  await expect(page.getByText("2 lớp đọc được, 1 dòng không đọc được: T9 sai.")).toBeVisible();
  await page.getByRole("button", { name: "Thêm 2 lớp" }).click();
  await expect(page.getByText("Đã thêm 2 lớp.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Thứ 2" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Thứ 5" })).toBeVisible();
  await expect(page.getByText("07:30–09:45")).toBeVisible();
  expect(stored).toHaveLength(2);
  expect(stored[0]).toMatchObject({ title: "Cấu trúc dữ liệu", category: "class", place: "B1.02", recurrence_rule: "weekly", visibility: "only_me" });
});

test("free time: shows common slots and names friends whose busy times are unknown", async ({ page }) => {
  const user = { id: "11111111-1111-4111-8111-111111111111", email: "vy@example.test", aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" };
  const kha = "22222222-2222-4222-8222-222222222222", minhAnh = "33333333-3333-4333-8333-333333333333";
  await page.addInitScript(account => {
    localStorage.setItem("sb-127-auth-token", JSON.stringify({ access_token: "mock-token", refresh_token: "mock-refresh", expires_at: Math.floor(Date.now() / 1000) + 3600, expires_in: 3600, token_type: "bearer", user: account }));
  }, user);
  await page.route("**/auth/v1/**", route => route.fulfill({ json: user }));
  await page.route("**/rest/v1/**", route => {
    const request = route.request(); const path = new URL(request.url()).pathname;
    if (path.endsWith("/rpc/list_friend_connections")) return route.fulfill({ json: [
      { user_id: kha, display_name: "Kha", username: "kha", status: "accepted", direction: "incoming", created_at: "2026-01-01T00:00:00Z" },
      { user_id: minhAnh, display_name: "Minh Anh", username: "minhanh", status: "accepted", direction: "incoming", created_at: "2026-01-01T00:00:00Z" }] });
    if (path.endsWith("/rpc/list_shared_busy")) return request.postDataJSON().p_owner_id === kha
      ? route.fulfill({ json: [] })
      : route.fulfill({ status: 400, json: { message: "availability not shared" } });
    return route.fulfill({ json: [] });
  });
  await page.goto("/free-time");
  await page.getByLabel("Kha", { exact: true }).check();
  await page.getByLabel("Minh Anh", { exact: true }).check();
  await page.getByRole("button", { name: "Tìm giờ rảnh" }).click();
  await expect(page.getByText("Chưa rõ lịch của Minh Anh")).toBeVisible();
  await expect(page.getByRole("heading", { name: /Giờ cùng rảnh · [1-9]/ })).toBeVisible();
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

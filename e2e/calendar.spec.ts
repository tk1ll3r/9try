import { expect, test, type Page } from "@playwright/test";
import { kha, signIn, user } from "./signedIn";

// Thursday 8 October 2026, 10:00, on the machine that runs the tests. The browser has the same time zone.
const now = new Date(2026, 9, 8, 10, 0);
const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
const at = (day: number, hour: number, minute = 0) => new Date(2026, 9, day, hour, minute).toISOString();
const row = (id: string, title: string, extra: Record<string, unknown>): Record<string, unknown> => ({
  id, owner_id: user.id, title, event_kind: "timed", start_at: null, end_at: null, all_day_start: null, all_day_end_exclusive: null,
  timezone: zone, visibility: "only_me", recurrence_rule: null, recurrence_until: null, calendar_event_exceptions: [], category: "event", place: null, ...extra,
});
const weeklyClass = () => row("class", "Cấu trúc dữ liệu", { start_at: at(1, 7, 30), end_at: at(1, 9, 45), recurrence_rule: "weekly", recurrence_until: "2026-12-31", category: "class", place: "B1.02" });
const fits = (page: Page) => expect.poll(async () => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

/** A calendar that keeps `events` the way the database would. Returns every change to the calendar that the app asked for. */
async function calendarOf(page: Page, events: Record<string, unknown>[]) {
  const changes: { path: string; method: string; body: Record<string, unknown> }[] = [];
  await page.route("**/rest/v1/**", route => {
    const request = route.request(); const url = new URL(request.url()); const path = url.pathname.replace(/^.*\/rest\/v1/, "");
    if (path === "/rpc/list_friend_connections") return route.fulfill({ json: [{ user_id: kha, display_name: "Kha", username: "kha", status: "accepted", direction: "incoming", created_at: "2026-01-01T00:00:00Z" }] });
    if (path === "/event_shares") return route.fulfill({ json: [{ user_id: kha, group_id: null }] });
    if (path === "/rpc/set_calendar_event_audience" || path === "/rpc/set_calendar_occurrence_exception") { changes.push({ path, method: "POST", body: request.postDataJSON() }); return route.fulfill({ json: null }); }
    if (path !== "/calendar_events") return route.fulfill({ json: [] });
    if (request.method() === "GET") return route.fulfill({ json: events });
    const id = url.searchParams.get("id")?.replace("eq.", "");
    const body = request.method() === "DELETE" ? {} : request.postDataJSON();
    changes.push({ path, method: request.method(), body });
    if (request.method() === "POST") { events.push({ ...row(`new-${events.length}`, "", {}), ...body }); return route.fulfill({ status: 201, json: { id: events.at(-1)!.id } }); }
    if (request.method() === "PATCH") Object.assign(events.find(event => event.id === id)!, body);
    if (request.method() === "DELETE") events.splice(events.findIndex(event => event.id === id), 1);
    return route.fulfill({ status: 204, body: "" });
  });
  return changes;
}

test("calendar: the month with the chosen day's list, the week as an hour grid, and an event that opens to be changed", async ({ page }) => {
  await page.clock.setFixedTime(now);
  await signIn(page);
  const events = [
    weeklyClass(),
    row("dinner", "Ăn tối với Kha", { start_at: at(8, 18, 30), end_at: at(8, 20), visibility: "selected_friends", place: "Quán Bà Tư" }),
    row("deadline", "Nộp bài Giải tích", { event_kind: "all_day", all_day_start: "2026-10-09", all_day_end_exclusive: "2026-10-10" }),
  ];
  const changes = await calendarOf(page, events);
  await page.goto("/calendar");

  // A wide screen opens on the month, with today chosen and its entries listed in time order with what they are.
  const views = page.getByRole("group", { name: "Cách xem lịch" });
  await expect(views.getByRole("button", { name: "Tháng" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("heading", { name: "Tháng 10, 2026" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Thứ năm, 8 tháng 10, 2 mục" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("region", { name: "Lịch Thứ năm, 8 tháng 10" }).getByRole("listitem"))
    .toHaveText([/07:30.*09:45.*Cấu trúc dữ liệu.*Lớp học.*B1\.02.*Lặp lại/, /18:30.*20:00.*Ăn tối với Kha.*Quán Bà Tư.*Bạn bè được chọn/]);
  // A class and an event have different colors.
  const color = (name: RegExp) => page.getByRole("button", { name }).evaluate(node => getComputedStyle(node).getPropertyValue("--tone"));
  expect(await color(/^Cấu trúc dữ liệu/)).not.toBe(await color(/^Ăn tối với Kha/));

  await page.getByRole("button", { name: "Thứ sáu, 9 tháng 10, 1 mục" }).click();
  await expect(page.getByRole("region", { name: "Lịch Thứ sáu, 9 tháng 10" }).getByRole("listitem")).toHaveText([/Cả ngày.*Nộp bài Giải tích/]);
  await page.getByRole("button", { name: "Tháng sau" }).click();
  await expect(page.getByRole("heading", { name: "Tháng 11, 2026" })).toBeVisible();
  await page.getByRole("button", { name: "Hôm nay", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Tháng 10, 2026" })).toBeVisible();

  // The week as an hour grid: an entry is as tall as it is long (2 h 15 at 48 px an hour, less a 2 px gap).
  await views.getByRole("button", { name: "Tuần" }).click();
  expect(Math.round((await page.getByRole("button", { name: "Cấu trúc dữ liệu, 07:30 đến 09:45" }).boundingBox())!.height)).toBe(106);
  await expect(page.getByRole("button", { name: "Nộp bài Giải tích", exact: true })).toBeVisible();
  // The view is kept on this device.
  await page.reload();
  await expect(views.getByRole("button", { name: "Tuần" })).toHaveAttribute("aria-pressed", "true");

  // An event opens in a dialog with the people it is shared with. Only what changed is sent.
  await views.getByRole("button", { name: "Lịch biểu" }).click();
  await page.getByRole("button", { name: "Ăn tối với Kha, 18:30 đến 20:00" }).click();
  const edit = page.getByRole("dialog", { name: "Sửa sự kiện" });
  await expect(edit.getByLabel("Tên sự kiện")).toHaveValue("Ăn tối với Kha");
  await expect(edit.getByLabel("Ai được xem?")).toHaveValue("selected_friends");
  await expect(edit.getByLabel("Kha", { exact: true })).toBeChecked();
  await edit.getByLabel("Tên sự kiện").fill("Ăn tối với Kha và Lan");
  await edit.getByLabel("Địa điểm (tùy chọn)").fill("Quán Mới");
  await edit.getByRole("button", { name: "Lưu", exact: true }).click();
  await expect(page.getByText("Đã lưu sự kiện.")).toBeVisible();
  const dinner = page.getByRole("button", { name: /^Ăn tối với Kha và Lan/ });
  await expect(dinner).toContainText("Quán Mới");
  expect(changes.map(change => [change.path, Object.keys(change.body)])).toEqual([["/calendar_events", ["title", "start_at", "end_at"]], ["/calendar_events", ["place"]]]);

  // Back to "only me", which the privacy screen sends people here for.
  await dinner.click();
  await edit.getByLabel("Ai được xem?").selectOption("only_me");
  await edit.getByRole("button", { name: "Lưu", exact: true }).click();
  await expect(dinner).not.toContainText("Bạn bè được chọn");
  expect(events[1].visibility).toBe("only_me");
  expect(changes.find(change => change.path === "/rpc/set_calendar_event_audience")!.body).toEqual({ p_event_id: "dinner", p_user_ids: [], p_group_id: null });

  // One time of a class that repeats can be dropped, after the app has asked.
  await page.getByRole("button", { name: "Cấu trúc dữ liệu, 07:30 đến 09:45" }).click();
  await page.getByRole("dialog", { name: "Sửa lớp học" }).getByRole("button", { name: "Bỏ buổi này" }).click();
  await page.getByRole("alertdialog", { name: "Bỏ buổi này?" }).getByRole("button", { name: "Bỏ buổi này" }).click();
  await expect(page.getByText("Đã bỏ buổi này khỏi lịch.")).toBeVisible();
  expect(changes.find(change => change.path === "/rpc/set_calendar_occurrence_exception")!.body).toMatchObject({ p_event_id: "class", p_occurrence_date: "2026-10-08", p_canceled: true });

  // Deleting asks too, and "Thôi" keeps the event.
  await dinner.click();
  await edit.getByRole("button", { name: "Xóa sự kiện" }).click();
  const question = page.getByRole("alertdialog", { name: "Xóa sự kiện?" });
  await question.getByRole("button", { name: "Thôi" }).click();
  expect(events).toHaveLength(3);
  await edit.getByRole("button", { name: "Xóa sự kiện" }).click();
  await question.getByRole("button", { name: "Xóa sự kiện" }).click();
  await expect(dinner).toHaveCount(0);
  expect(events.map(event => event.id)).toEqual(["class", "deadline"]);
});

test("calendar: a new event starts on the chosen day, keeps its length when moved, and can last all day", async ({ page }) => {
  await page.clock.setFixedTime(now);
  await signIn(page);
  const events: Record<string, unknown>[] = [];
  await calendarOf(page, events);
  await page.goto("/calendar");

  // From the top of the screen, today: the next full hour, for an hour. The end is under "Tùy chọn khác".
  await page.getByRole("button", { name: "Thêm sự kiện", exact: true }).click();
  const form = page.getByRole("dialog", { name: "Thêm sự kiện" });
  await expect(form.getByLabel("Bắt đầu")).toHaveValue("2026-10-08T11:00");
  await expect(form.getByText("đến 12:00")).toBeVisible();
  await expect(form.getByLabel("Kết thúc")).toHaveCount(0);
  await form.getByRole("button", { name: "Tùy chọn khác" }).click();
  await expect(form.getByLabel("Kết thúc")).toHaveValue("2026-10-08T12:00");
  await page.keyboard.press("Escape");

  // From the "+" of another day: 08:00 that day. Moving the start moves the end with it.
  await page.getByRole("button", { name: "Thứ sáu, 9 tháng 10" }).click();
  await page.getByRole("button", { name: "Thêm sự kiện vào Thứ sáu, 9 tháng 10" }).click();
  await expect(form.getByLabel("Bắt đầu")).toHaveValue("2026-10-09T08:00");
  await form.getByLabel("Bắt đầu").fill("2026-10-09T14:30");
  await expect(form.getByLabel("Kết thúc")).toHaveValue("2026-10-09T15:30");

  await form.getByLabel("Tên sự kiện").fill("Ôn thi");
  await form.getByLabel("Kết thúc").fill("2026-10-09T14:00");
  await form.getByRole("button", { name: "Thêm vào lịch" }).click();
  await expect(form.getByRole("alert")).toHaveText("Giờ kết thúc phải sau giờ bắt đầu.");
  expect(events).toHaveLength(0);
  // What was typed is still there after the refusal.
  await expect(form.getByLabel("Tên sự kiện")).toHaveValue("Ôn thi");

  // A repeating event gets an end date by itself.
  await form.getByLabel("Kết thúc").fill("2026-10-09T16:00");
  await form.getByLabel("Lặp lại").selectOption("weekly");
  await expect(form.getByLabel("Lặp đến hết ngày")).toHaveValue("2027-02-09");
  await form.getByLabel("Địa điểm (tùy chọn)").fill("Thư viện");
  await form.getByRole("button", { name: "Thêm vào lịch" }).click();
  await expect(form).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Lịch Thứ sáu, 9 tháng 10" }).getByRole("listitem")).toHaveText([/14:30.*16:00.*Ôn thi.*Thư viện.*Lặp lại/]);
  expect(events[0]).toMatchObject({ title: "Ôn thi", event_kind: "timed", place: "Thư viện", recurrence_rule: "weekly", recurrence_until: "2027-02-09", visibility: "only_me", start_at: at(9, 14, 30), end_at: at(9, 16) });

  await page.getByRole("button", { name: "Thêm sự kiện vào Thứ sáu, 9 tháng 10" }).click();
  await expect(form.getByLabel("Tên sự kiện")).toHaveValue("");
  await form.getByRole("button", { name: "Tùy chọn khác" }).click();
  await form.getByLabel("Cả ngày").check();
  await expect(form.getByLabel("Ngày bắt đầu")).toHaveValue("2026-10-09");
  await form.getByLabel("Ngày cuối").fill("2026-10-10");
  await form.getByLabel("Tên sự kiện").fill("Về quê");
  await form.getByRole("button", { name: "Thêm vào lịch" }).click();
  await expect(form).toHaveCount(0);
  expect(events[1]).toMatchObject({ title: "Về quê", event_kind: "all_day", all_day_start: "2026-10-09", all_day_end_exclusive: "2026-10-11", start_at: null, recurrence_rule: null });
});

test("calendar: an event in a few taps from a template, a time and a length; a copy of an event; a plan from an activity", async ({ page }) => {
  await page.clock.setFixedTime(now);
  await signIn(page);
  const events: Record<string, unknown>[] = [];
  const changes = await calendarOf(page, events);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/calendar");

  // A template names the event and sets its length; "Tối nay" sets the time. Nobody else sees it.
  await page.getByRole("button", { name: "Thêm sự kiện", exact: true }).click();
  const form = page.getByRole("dialog", { name: "Thêm sự kiện" });
  await form.getByRole("button", { name: "Ăn tối" }).click();
  await expect(form.getByLabel("Tên sự kiện")).toHaveValue("Ăn tối");
  await form.getByRole("button", { name: "Tối nay" }).click();
  await expect(form.getByLabel("Bắt đầu")).toHaveValue("2026-10-08T19:00");
  await expect(form.getByText("đến 20:30")).toBeVisible();
  await form.getByRole("button", { name: "2 giờ" }).click();
  await expect(form.getByRole("button", { name: "2 giờ" })).toHaveAttribute("aria-pressed", "true");
  await expect(form.getByRole("status", { name: "Ai thấy sự kiện này" })).toHaveText("Chỉ mình bạn thấy sự kiện này.");
  await fits(page);

  // Ticking a friend shares it with them, and the form says so before anything is saved.
  await form.getByLabel("Kha").check();
  await expect(form.getByRole("status", { name: "Ai thấy sự kiện này" })).toHaveText("Kha sẽ thấy tên và giờ của sự kiện này.");
  await form.getByRole("button", { name: "Thêm vào lịch" }).click();
  await expect(form).toHaveCount(0);
  expect(events[0]).toMatchObject({ title: "Ăn tối", visibility: "selected_friends", start_at: at(8, 19), end_at: at(8, 21) });
  expect(changes.find(change => change.path === "/rpc/set_calendar_event_audience")!.body).toMatchObject({ p_user_ids: [kha], p_group_id: null });

  // The next event is private again: the friend of the last one is offered, not chosen.
  await page.getByRole("button", { name: "Thêm sự kiện", exact: true }).click();
  await expect(form.getByLabel("Kha")).not.toBeChecked();
  await expect(form.getByRole("status", { name: "Ai thấy sự kiện này" })).toHaveText("Chỉ mình bạn thấy sự kiện này.");
  await page.keyboard.press("Escape");

  // A copy starts from the event's name, time and length, and is private.
  await page.getByRole("region", { name: "Lịch Thứ năm, 8 tháng 10" }).getByRole("button", { name: /Ăn tối/ }).click();
  await page.getByRole("dialog", { name: "Sửa sự kiện" }).getByRole("button", { name: "Nhân bản" }).click();
  await expect(form.getByLabel("Tên sự kiện")).toHaveValue("Ăn tối");
  await expect(form.getByLabel("Bắt đầu")).toHaveValue("2026-10-08T19:00");
  await expect(form.getByText("đến 21:00")).toBeVisible();
  await form.getByRole("button", { name: "Ngày mai" }).click();
  await expect(form.getByLabel("Bắt đầu")).toHaveValue("2026-10-09T09:00");
  await form.getByRole("button", { name: "Thêm vào lịch" }).click();
  await expect(form).toHaveCount(0);
  expect(events[1]).toMatchObject({ title: "Ăn tối", visibility: "only_me", start_at: at(9, 9), end_at: at(9, 11) });

  // Another screen can open a new event by name, as the Mode screen does for the activity that is on.
  await page.goto("/calendar?new=C%C3%A0%20ph%C3%AA");
  await expect(form.getByLabel("Tên sự kiện")).toHaveValue("Cà phê");
  await expect(page).toHaveURL(/\/calendar$/);
});

test("calendar on a phone: today's list first, the hour grid scrolls inside its card, and the dark look is dark", async ({ page }) => {
  await page.clock.setFixedTime(now);
  await signIn(page);
  await calendarOf(page, [weeklyClass()]);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/calendar");

  const views = page.getByRole("group", { name: "Cách xem lịch" });
  await expect(views.getByRole("button", { name: "Lịch biểu" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("button", { name: "Thứ năm, 8 tháng 10, 1 mục" })).toHaveAttribute("aria-pressed", "true");
  // Today's first entry is on screen without scrolling.
  const lesson = page.getByRole("button", { name: "Cấu trúc dữ liệu, 07:30 đến 09:45" });
  await expect(lesson).toBeInViewport({ ratio: 1 });
  expect(await page.evaluate(() => [document.documentElement.dataset.theme, getComputedStyle(document.body).backgroundColor])).toEqual(["dark", "rgb(22, 15, 20)"]);
  await fits(page);

  // The hour grid keeps readable columns: it is wider than the phone and scrolls inside its card, with today brought into view.
  await views.getByRole("button", { name: "Tuần" }).click();
  await expect(lesson).toBeInViewport({ ratio: 1 });
  await fits(page);
  await views.getByRole("button", { name: "Tháng" }).click();
  await expect(page.getByRole("button", { name: "Thứ năm, 1 tháng 10, 1 mục" })).toBeVisible();
  await fits(page);
});

test("a friend's shared calendar shows their events and busy times, with nothing to press", async ({ page }) => {
  await page.clock.setFixedTime(now);
  await signIn(page);
  const shared = { id: "s1", owner_id: kha, owner_display_name: "Kha", owner_username: "kha", title: "Đá bóng", description: "", event_kind: "timed", start_at: at(8, 17), end_at: at(8, 18, 30),
    all_day_start: null, all_day_end_exclusive: null, timezone: zone, visibility: "selected_friends", recurrence_rule: null, recurrence_until: null, exceptions: [] };
  await page.route("**/rest/v1/**", route => {
    const path = new URL(route.request().url()).pathname;
    if (path.endsWith("/rpc/list_shared_calendar_events")) return route.fulfill({ json: [shared] });
    // The shared event is a busy time too; it must show once, with its name.
    if (path.endsWith("/rpc/list_shared_busy")) return route.fulfill({ json: [shared, { ...shared, id: "b1", start_at: at(8, 13), end_at: at(8, 15) }] });
    return route.fulfill({ json: [] });
  });
  await page.goto(`/calendar/shared/${kha}`);
  await expect(page.getByRole("heading", { name: "Kha", level: 1 })).toBeVisible();
  const list = page.getByRole("region", { name: "Lịch Thứ năm, 8 tháng 10" });
  await expect(list.getByRole("listitem")).toHaveText([/13:00.*15:00.*Bận/, /17:00.*18:30.*Đá bóng/]);
  await expect(list.getByRole("button")).toHaveCount(0);
  await expect(page.getByText("Ô “Bận” là lúc người này có việc")).toBeVisible();
});

test("calendar on a phone: an .ics file is read on the device, shown by kind with what is left out, and stored in one request", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.clock.setFixedTime(now);
  await signIn(page);
  const events: Record<string, unknown>[] = [];
  await calendarOf(page, events);
  const imports: { p_events: Record<string, any>[] }[] = [];
  await page.route("**/rest/v1/rpc/import_calendar_events", route => {
    const body = route.request().postDataJSON() as { p_events: Record<string, any>[] };
    imports.push(body);
    for (const item of body.p_events) events.push(row(item.uid, item.title, item.kind === "timed"
      ? { start_at: item.start, end_at: item.end, recurrence_rule: item.rule, recurrence_until: item.until, category: item.category, place: item.place || null }
      : { event_kind: "all_day", all_day_start: item.start, all_day_end_exclusive: item.end }));
    return route.fulfill({ json: { added: body.p_events.length, already_there: 0 } });
  });
  // Times without a zone: wall-clock time where the reader is, so the file means the same on any machine.
  const one = (lines: string[]) => ["BEGIN:VEVENT", ...lines, "END:VEVENT"].join("\r\n");
  const file = ["BEGIN:VCALENDAR", "VERSION:2.0",
    one(["UID:dentist", "SUMMARY:Khám răng", "LOCATION:Phòng khám", "DTSTART:20261008T150000", "DTEND:20261008T160000"]),
    one(["UID:maths", "SUMMARY:Toán rời rạc", "LOCATION:B1.02", "DTSTART:20260907T130000", "DTEND:20260907T151500", "RRULE:FREQ=WEEKLY;BYDAY=MO,WE;UNTIL=20261231T000000"]),
    one(["UID:fortnight", "SUMMARY:Họp cách tuần", "DTSTART:20261015T090000", "DTEND:20261015T100000", "RRULE:FREQ=WEEKLY;INTERVAL=2;COUNT=3"]),
    one(["UID:past", "SUMMARY:Đã qua", "DTSTART:20260901T090000", "DTEND:20260901T100000"]),
    one(["UID:off", "SUMMARY:Bị hủy", "DTSTART:20261020T090000", "DTEND:20261020T100000", "STATUS:CANCELLED"]),
    "END:VCALENDAR", ""].join("\r\n");

  await page.goto("/calendar");
  await page.getByLabel("Nhập, xuất và liên kết lịch").click();
  await page.getByRole("button", { name: "Nhập lịch .ics" }).click();
  const choose = page.getByLabel("Chọn file lịch .ics");

  // What Google's export gives is a .zip; the app says what to do with it.
  await choose.setInputFiles({ name: "calendar.zip", mimeType: "application/zip", buffer: Buffer.from([0x50, 0x4b, 3, 4, 20, 0, 0, 0]) });
  await expect(page.getByRole("alert")).toHaveText("Đây là file .zip. Hãy giải nén rồi chọn file .ics bên trong.");

  await choose.setInputFiles({ name: "lich.ics", mimeType: "text/calendar", buffer: Buffer.from(file) });
  const preview = page.getByLabel("Xem trước file lịch");
  await expect(preview.getByRole("heading", { name: "Sự kiện một lần · 1" })).toBeVisible();
  await expect(preview.getByRole("heading", { name: "Lặp lại · 2" })).toBeVisible();
  await expect(preview.getByText("Hằng tuần").first()).toContainText("đến 31/12/2026");
  await expect(preview.getByRole("heading", { name: "Lặp theo kiểu khác · 3 lần" })).toBeVisible();
  await expect(preview.getByRole("listitem").filter({ hasText: "đã kết thúc" })).toHaveText("1 đã kết thúc");
  await expect(preview.getByRole("listitem").filter({ hasText: "đã hủy" })).toHaveText("1 đã hủy");
  await fits(page);

  // What is over can be imported too, when the person asks for it.
  await preview.getByLabel("Bỏ sự kiện đã kết thúc").uncheck();
  await expect(preview.getByRole("button", { name: "Nhập 7 sự kiện" })).toBeVisible();
  await preview.getByLabel("Bỏ sự kiện đã kết thúc").check();
  await preview.getByLabel("Lịch lặp hằng tuần là lớp học (hiện ở Thời khóa biểu)").check();
  await preview.getByRole("button", { name: "Nhập 6 sự kiện" }).click();

  await expect(page.getByRole("status").filter({ hasText: "Đã nhập" })).toHaveText("Đã nhập 6 sự kiện riêng tư.");
  expect(imports).toHaveLength(1);
  expect(imports[0].p_events.map(item => [item.uid, item.rule ?? null, item.category])).toEqual([
    ["maths#MO", "weekly", "class"], ["maths#WE", "weekly", "class"], ["dentist", null, "event"],
    ["fortnight#2026-10-15", null, "event"], ["fortnight#2026-10-29", null, "event"], ["fortnight#2026-11-12", null, "event"],
  ]);
  expect(imports[0].p_events[0]).toMatchObject({ title: "Toán rời rạc", place: "B1.02", kind: "timed", timezone: zone, until: "2026-12-31", exceptions: [] });
  // The calendar reloads: today's list has the dentist.
  await expect(page.getByText("Khám răng").first()).toBeVisible();
  await fits(page);
});

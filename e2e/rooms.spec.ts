import { expect, test, type Page } from "@playwright/test";
import { kha, signIn, user } from "./signedIn";

const meetupId = "22222222-2222-4222-8222-0000000000a1";
const hour = 3_600_000;
interface Row { [key: string]: unknown }
interface Rooms { rooms: Row[]; messages: Row[]; calls: { name: string; body: Row }[]; /** Milliseconds the list of rooms takes longer than everything else. */ slowRooms?: number }

const room = (extra: Row): Row => ({
  id: "33333333-3333-4333-8333-0000000000b1", source_kind: "meetup", source_id: meetupId, occurrence_key: "", title: "Ăn tối", owner_id: kha, owner_name: "Kha",
  closes_at: new Date(Date.now() + 27 * hour).toISOString(), closed: false, joined: false, muted: false, removed: false, member_count: 1, ...extra,
});

test("rooms: an active Mode can open a discussion, with the short mode title and owner on a secondary line", async ({ page }) => {
  await signIn(page);
  const id = "33333333-3333-4333-8333-0000000000b2";
  const closesAt = new Date(Date.now() + hour).toISOString();
  const calls: Row[] = [];
  let modeRoom: Row | null = null;
  await page.route("**/rest/v1/**", async route => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace(/^.*\/rest\/v1/, "");
    const body: Row = request.method() === "POST" ? request.postDataJSON() ?? {} : {};
    if (path === "/rpc/list_visible_activity_modes") return route.fulfill({ json: [{ user_id: user.id, mode: "studying", updated_at: new Date().toISOString(), expires_at: closesAt, mode_label: null, mode_icon: null, mode_color: null }] });
    if (path === "/rpc/list_rooms") return route.fulfill({ json: modeRoom ? [modeRoom] : [] });
    if (path === "/rpc/open_room") {
      calls.push(body);
      modeRoom = { id, source_kind: "mode", source_id: user.id, occurrence_key: "", title: "Học bài", owner_id: user.id, owner_name: "Vy", closes_at: closesAt, closed: false, joined: true, muted: false, removed: false, member_count: 1 };
      return route.fulfill({ json: id });
    }
    if (path === "/rpc/list_conversations") return route.fulfill({ json: modeRoom ? [{ id, kind: "room", title: "Vy · Học bài", other_user_id: null, group_id: null, last_message_at: null, last_message_body: null, unread_count: 0, recent_messages: 0, closed: false, owner_id: user.id, muted: false }] : [] });
    return route.fulfill({ json: [] });
  });

  await page.goto("/");
  await expect(page.getByRole("region", { name: "Mode của bạn" })).toContainText("Học bài");
  await page.getByRole("button", { name: "Mở thảo luận" }).click();
  await page.getByLabel("Lời mở đầu (tùy chọn)").fill("Mọi người học cùng nhé");
  await page.getByRole("button", { name: "Mở phòng" }).click();
  await expect(page).toHaveURL(new RegExp(`/chat/${id}$`));
  await expect(page.getByRole("heading", { level: 2, name: "Học bài" })).toBeVisible();
  await expect(page.getByText("Thảo luận mở bởi Vy")).toHaveCount(2);
  await expect(page.getByText("Thảo luận mở bởi Vy").nth(0)).toBeVisible();
  await expect(page.getByText("Thảo luận mở bởi Vy").nth(1)).toBeVisible();
  expect(calls).toEqual([{ p_source_kind: "mode", p_source_id: user.id, p_occurrence: null, p_message: "Mọi người học cùng nhé" }]);
});

/** A server for rooms that answers from `state` the way the database would, and records what the app asks it to do. */
async function roomServer(page: Page, organizer: string, state: Rooms) {
  await page.route("**/rest/v1/**", async route => {
    const request = route.request(); const path = new URL(request.url()).pathname.replace(/^.*\/rest\/v1/, "");
    const body: Row = request.method() === "POST" ? request.postDataJSON() ?? {} : {};
    const found = () => state.rooms.find(item => item.id === body.p_conversation_id)!;
    if (path === "/rpc/list_rooms" && state.slowRooms) await new Promise(resolve => setTimeout(resolve, state.slowRooms));
    if (path === "/meetup_invitees") return route.fulfill({ json: [{ rsvp_status: "going", meetup: { id: meetupId, organizer_id: organizer, title: "Ăn tối", description: "", status: "confirmed", timezone: "UTC", start_at: new Date(Date.now() + hour).toISOString(), end_at: new Date(Date.now() + 3 * hour).toISOString(), capacity: null, location_name: null, group_id: null } }] });
    if (path === "/rpc/list_rooms") return route.fulfill({ json: state.rooms.filter(item => (!body.p_conversation_id || item.id === body.p_conversation_id) && (!body.p_source_kind || (item.source_kind === body.p_source_kind && item.source_id === body.p_source_id))) });
    if (path === "/rpc/list_conversations") return route.fulfill({ json: state.rooms.filter(item => item.joined).map(item => ({ id: item.id, kind: "room", title: item.title, other_user_id: null, group_id: null, last_message_at: null, last_message_body: state.messages.at(-1)?.body ?? null, unread_count: 0, recent_messages: state.messages.length, closes_at: item.closes_at, closed: item.closed, source_kind: item.source_kind, source_id: item.source_id, owner_id: item.owner_id, muted: item.muted })) });
    if (path === "/rpc/list_messages") return route.fulfill({ json: [...state.messages].reverse() });
    if (path === "/rpc/list_room_members") return route.fulfill({ json: [{ user_id: kha, display_name: "Kha", avatar_url: null, is_owner: organizer === kha }, { user_id: user.id, display_name: "Vy", avatar_url: null, is_owner: organizer === user.id }].slice(0, Number(found().member_count)) });
    if (["/rpc/open_room", "/rpc/join_room", "/rpc/leave_room", "/rpc/mute_room", "/rpc/close_room", "/rpc/remove_room_member", "/rpc/post_message"].includes(path)) {
      state.calls.push({ name: path.slice(5), body });
      if (path === "/rpc/open_room") {
        state.rooms.push(room({ owner_id: user.id, owner_name: "Vy", joined: true }));
        if (body.p_message) state.messages.push({ id: "m0", sender_id: user.id, sender_name: "Vy", body: body.p_message, created_at: new Date().toISOString() });
        return route.fulfill({ json: state.rooms.at(-1)!.id });
      }
      if (path === "/rpc/post_message") {
        // A closed room takes no message, whatever the app shows.
        if (found().closed) return route.fulfill({ status: 400, json: { code: "P0001", message: "conversation closed" } });
        state.messages.push({ id: body.p_id, sender_id: user.id, sender_name: "Vy", body: body.p_body, created_at: new Date().toISOString() });
      }
      if (path === "/rpc/join_room") Object.assign(found(), { joined: true, member_count: Number(found().member_count) + 1 });
      if (path === "/rpc/leave_room") Object.assign(found(), { joined: false, member_count: Number(found().member_count) - 1 });
      if (path === "/rpc/mute_room") found().muted = body.p_muted;
      if (path === "/rpc/close_room") found().closed = true;
      return route.fulfill({ json: null });
    }
    return route.fulfill({ json: [] });
  });
}

test("rooms: the organizer turns a meetup's discussion on with a first message, writes, and closes it", async ({ page }) => {
  await signIn(page);
  const state: Rooms = { rooms: [], messages: [], calls: [] };
  await roomServer(page, user.id, state);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`/meetups/${meetupId}`);
  await expect(page.getByRole("heading", { name: "Ăn tối", level: 1 })).toBeVisible();

  await page.getByRole("button", { name: "Mở thảo luận" }).click();
  await page.getByLabel("Lời mở đầu (tùy chọn)").fill("Mấy giờ mọi người tới?");
  await page.getByRole("button", { name: "Mở phòng" }).click();
  await expect(page).toHaveURL(/\/chat\/33333333-3333-4333-8333-0000000000b1$/);
  expect(state.calls[0]).toEqual({ name: "open_room", body: { p_source_kind: "meetup", p_source_id: meetupId, p_occurrence: null, p_message: "Mấy giờ mọi người tới?" } });

  // The room says what it is about, when it closes and who is in it.
  await expect(page.getByRole("heading", { name: "Ăn tối", level: 2 })).toBeVisible();
  await expect(page.getByText(/^Đóng lúc \d{2}:\d{2} ngày/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Mở hoạt động" })).toHaveAttribute("href", `/meetups/${meetupId}`);
  await expect(page.locator('[aria-live="polite"]').getByText("Mấy giờ mọi người tới?")).toBeVisible();
  await page.getByRole("textbox", { name: "Tin nhắn" }).fill("7 giờ nhé");
  await page.getByRole("button", { name: "Gửi tin nhắn" }).click();
  await expect(page.locator('[aria-live="polite"]').getByText("7 giờ nhé")).toBeVisible();
  await expect.poll(async () => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

  // Closing asks first. A closed room has no box to write in, and says when its messages go.
  await page.getByLabel("Thao tác với phòng").click();
  await page.getByRole("button", { name: "Đóng phòng" }).click();
  await page.getByRole("alertdialog", { name: "Đóng phòng?" }).getByRole("button", { name: "Đóng phòng" }).click();
  await expect(page.getByText("Phòng đã đóng. Không viết thêm được", { exact: false })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Tin nhắn" })).toHaveCount(0);
  await expect(page.getByText(/^Đã đóng · tin nhắn bị xóa ngày/).last()).toBeVisible();
  expect(state.calls.at(-1)).toEqual({ name: "close_room", body: { p_conversation_id: "33333333-3333-4333-8333-0000000000b1" } });
  // What was written is still there to read.
  await expect(page.locator('[aria-live="polite"]').getByText("7 giờ nhé")).toBeVisible();
});

test("rooms: a guest finds an open discussion, joins it from the meetup, mutes it and leaves", async ({ page }) => {
  await signIn(page);
  // The list of rooms answers later than the list of conversations, as two requests on a real network do.
  // After leaving, the conversation is gone from its list while the rooms are still loading: the screen
  // that asked to leave is taken away at that moment, and the way back to the list must happen all the same.
  const state: Rooms = { rooms: [room({})], messages: [{ id: "m0", sender_id: kha, sender_name: "Kha", body: "Mấy giờ mọi người tới?", created_at: new Date().toISOString() }], calls: [], slowRooms: 250 };
  await roomServer(page, kha, state);
  await page.setViewportSize({ width: 390, height: 844 });

  // It is listed with the conversations, as something to join.
  await page.goto("/chat");
  const openOnes = page.getByRole("region", { name: "Thảo luận đang mở" });
  await expect(openOnes.getByRole("link")).toHaveText([/Ăn tối.*1 người.*Tham gia/]);

  // And it is on the meetup itself.
  await page.goto(`/meetups/${meetupId}`);
  await page.getByRole("button", { name: "Tham gia thảo luận · 1" }).click();
  await expect(page).toHaveURL(/\/chat\/33333333-3333-4333-8333-0000000000b1$/);
  expect(state.calls[0]).toEqual({ name: "join_room", body: { p_conversation_id: "33333333-3333-4333-8333-0000000000b1" } });
  await expect(page.locator('[aria-live="polite"]').getByText("Mấy giờ mọi người tới?")).toBeVisible();
  // A guest cannot close the room.
  await page.getByLabel("Thao tác với phòng").click();
  await expect(page.getByRole("button", { name: "Đóng phòng" })).toHaveCount(0);
  await page.getByRole("button", { name: "Tắt thông báo phòng này" }).click();
  await expect.poll(() => state.calls.at(-1)).toEqual({ name: "mute_room", body: { p_conversation_id: "33333333-3333-4333-8333-0000000000b1", p_muted: true } });

  await page.getByLabel("Thao tác với phòng").click();
  await page.getByRole("button", { name: "Rời phòng" }).click();
  await page.getByRole("alertdialog", { name: "Rời phòng?" }).getByRole("button", { name: "Rời phòng" }).click();
  await expect(page).toHaveURL(/\/chat$/);
  expect(state.calls.at(-1)!.name).toBe("leave_room");
  // Still open, so it is offered again.
  await expect(openOnes.getByRole("link")).toHaveCount(1);
});

test("rooms: the address of a room that is not for this person says so, and a room they must join first offers the door", async ({ page }) => {
  await signIn(page);
  const state: Rooms = { rooms: [room({})], messages: [], calls: [] };
  await roomServer(page, kha, state);

  // A room the server does not list for them: an expired one, or one they may not see.
  await page.goto("/chat/44444444-4444-4444-8444-0000000000c1");
  await expect(page.getByText("Không mở được cuộc trò chuyện này. Có thể nó đã hết hạn, hoặc không dành cho bạn.")).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Tin nhắn" })).toHaveCount(0);

  // A room they may join, opened by its address, as a notification does: who opened it, and the way in.
  await page.goto("/chat/33333333-3333-4333-8333-0000000000b1");
  await expect(page.getByText(/^Kha mở thảo luận này\. 1 người đang ở trong phòng\./)).toBeVisible();
  await page.getByRole("button", { name: "Tham gia thảo luận" }).click();
  await expect(page.getByRole("textbox", { name: "Tin nhắn" })).toBeVisible();
});

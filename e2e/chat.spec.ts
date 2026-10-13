import { expect, test, type Page } from "@playwright/test";
import { kha, signIn, user } from "./signedIn";

const fits = (page: Page) => expect.poll(async () => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
const pixel = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
const minutesAgo = (count: number) => new Date(Date.now() - count * 60_000).toISOString();

interface Row { [key: string]: any }
const row = (id: string, sender: string, name: string, body: string, ago: number, extra: Row = {}): Row => ({
  id, sender_id: sender, sender_name: name, body, created_at: minutesAgo(ago), reply_to: null, reactions: {}, my_reaction: null, edited: false, deleted: false,
  kind: "text", attachments: null, ref_path: null, ref_title: null, has_text: body !== "", ...extra,
});

/** A server that keeps one direct conversation with Kha the way the database would, and records what the app asks of it. */
async function chatServer(page: Page, messages: Row[], options: { unread?: number; kind?: string } = {}) {
  const state = { messages, calls: [] as { name: string; body: Row }[], uploads: [] as string[], removed: [] as string[], muted: null as string | null, unread: options.unread ?? 0, failNextPost: false };
  const line = (item: Row) => item.deleted ? "Tin nhắn đã thu hồi" : item.body || (item.kind === "photo" ? "Đã gửi ảnh" : item.ref_title);
  await page.route("**/rest/v1/**", route => {
    const request = route.request(); const path = new URL(request.url()).pathname.replace(/^.*\/rest\/v1/, "");
    const body = (request.method() === "POST" ? request.postDataJSON() ?? {} : {}) as Row; const name = path.slice(5);
    if (path === "/rpc/list_conversations") return route.fulfill({ json: [{ id: "c1", kind: options.kind ?? "direct", title: options.kind === "group" ? "Lớp KTPM" : "Kha", other_user_id: options.kind === "group" ? null : kha, group_id: options.kind === "group" ? "g1" : null,
      last_message_at: state.messages.at(-1)?.created_at ?? null, last_message_body: state.messages.length ? line(state.messages.at(-1)!) : null, unread_count: state.unread, recent_messages: state.messages.length,
      closes_at: null, closed: false, source_kind: null, source_id: null, owner_id: null, muted: state.muted !== null, muted_until: state.muted }] });
    if (path === "/rpc/list_messages") return route.fulfill({ json: [...state.messages].reverse().map(item => ({ ...item, body: line(item) })) });
    if (path === "/rpc/list_conversation_reads") return route.fulfill({ json: [{ user_id: kha, display_name: "Kha", avatar_url: null, last_read_at: minutesAgo(0.5) }] });
    if (path === "/group_memberships") return route.fulfill({ json: [{ role: "admin", group: { id: "g1", name: "Lớp KTPM", description: "", member_count: 3, archived_at: null } }] });
    if (path === "/rpc/search_messages") return route.fulfill({ json: state.messages.filter(item => !item.deleted && item.body.toLowerCase().includes(String(body.p_query).toLowerCase())).reverse().map(item => ({ id: item.id, sender_name: item.sender_name, body: item.body, created_at: item.created_at })) });
    if (!path.startsWith("/rpc/")) return route.fulfill({ json: [] });
    // The server is out of reach for one message.
    if (name === "post_message" && state.failNextPost) { state.failNextPost = false; return route.fulfill({ status: 503, json: { message: "upstream unavailable" } }); }
    if (["post_message", "edit_message", "delete_message", "react_to_message", "set_conversation_mute", "mark_conversation_read"].includes(name)) state.calls.push({ name, body });
    const target = state.messages.find(item => item.id === body.p_id);
    if (name === "mark_conversation_read") state.unread = 0;
    if (name === "post_message") {
      const quoted = state.messages.find(item => item.id === body.p_reply_to_id);
      state.messages.push(row(body.p_id, user.id, "Vy", body.p_body, 0, {
        reply_to: quoted ? { id: quoted.id, sender_name: quoted.sender_name, body: quoted.body, deleted: false } : null,
        kind: body.p_attachments ? "photo" : body.p_ref_path ? "card" : "text", attachments: body.p_attachments, ref_path: body.p_ref_path, ref_title: body.p_ref_title,
      }));
    }
    if (name === "edit_message" && target) Object.assign(target, { body: body.p_body, edited: true });
    if (name === "delete_message" && target) Object.assign(target, { body: "", deleted: true, attachments: null, has_text: false, reactions: {} });
    if (name === "react_to_message" && target) Object.assign(target, { my_reaction: body.p_reaction, reactions: body.p_reaction ? { [body.p_reaction]: 1 } : {} });
    if (name === "set_conversation_mute") state.muted = body.p_minutes === null ? null : body.p_minutes === 0 ? "infinity" : new Date(Date.now() + body.p_minutes * 60_000).toISOString();
    return route.fulfill({ json: null });
  });
  await page.route("**/storage/v1/object/**", route => {
    const request = route.request(); const path = decodeURIComponent(new URL(request.url()).pathname.replace(/^.*\/storage\/v1\/object\//, ""));
    if (request.method() === "GET") return route.fulfill({ body: pixel, contentType: "image/png" });
    if (path === "sign/chat") return route.fulfill({ json: (request.postDataJSON() as { paths: string[] }).paths.map(item => ({ path: item, signedURL: `/object/sign/chat/${item}?token=t`, error: null })) });
    if (request.method() === "DELETE") { state.removed.push(...(request.postDataJSON() as { prefixes: string[] }).prefixes); return route.fulfill({ json: [] }); }
    state.uploads.push(path);
    return route.fulfill({ json: { Key: path, Id: "file" } });
  });
  return state;
}
const named = (state: { calls: { name: string; body: Row }[] }, name: string) => state.calls.filter(call => call.name === name).map(call => call.body);
const bubble = (page: Page, id: string) => page.locator(`#msg-${id}`);
/** Opens the "…" of a message. It shows under the pointer; a test presses it where it is. */
const menuOf = async (page: Page, id: string, label = "Thao tác với tin nhắn") => { await bubble(page, id).hover(); await bubble(page, id).getByLabel(label).click(); };

test("chat: a thread in runs with a day line and an unread line; an answer, a reaction, a change within 15 minutes and a message taken back", async ({ page }) => {
  await signIn(page);
  const server = await chatServer(page, [
    row("m1", kha, "Kha", "Hôm qua vui ghê", 26 * 60), row("m2", user.id, "Vy", "Ừ, lần sau đi nữa", 26 * 60 - 1),
    row("m3", kha, "Kha", "Tối nay đi ăn không?", 6), row("m4", kha, "Kha", "Xem https://quan.example/menu nhé", 5),
  ], { unread: 2 });
  await page.goto("/chat/c1");

  // Two days, the line before the two messages that were unread, and one name of the day for today.
  await expect(page.getByRole("main").getByText("Hôm qua", { exact: true })).toBeVisible();
  await expect(page.getByRole("main").getByText("Hôm nay", { exact: true })).toBeVisible();
  await expect(page.getByText("Chưa đọc từ đây")).toBeVisible();
  const order = await page.locator("#unread-line, [id^=msg-]").evaluateAll(nodes => nodes.map(node => node.id));
  expect(order).toEqual(["msg-m1", "msg-m2", "unread-line", "msg-m3", "msg-m4"]);
  // An address in a message is a link that opens outside the app.
  await expect(bubble(page, "m4").getByRole("link", { name: "https://quan.example/menu" })).toHaveAttribute("target", "_blank");
  // What Kha has read is said under one's own last message.
  await expect(bubble(page, "m2").getByText("Đã xem")).toBeVisible();

  // An answer: the quoted line stands in the box, then above the new message, and leads back to the original.
  await menuOf(page, "m3");
  await bubble(page, "m3").getByRole("button", { name: "Trả lời" }).click();
  await expect(page.getByText("Trả lời Kha")).toBeVisible();
  await page.getByRole("textbox", { name: "Tin nhắn" }).fill("Đi, 7 giờ nhé");
  await page.keyboard.press("Enter");
  await expect.poll(() => named(server, "post_message")).toHaveLength(1);
  expect(named(server, "post_message")[0]).toMatchObject({ p_conversation_id: "c1", p_body: "Đi, 7 giờ nhé", p_reply_to_id: "m3", p_attachments: null, p_ref_path: null });
  const mine = named(server, "post_message")[0].p_id as string;
  await expect(bubble(page, mine).getByRole("button", { name: /Tối nay đi ăn không\?/ })).toBeVisible();
  await expect(page.getByText("Trả lời Kha")).toHaveCount(0);

  // A reaction, shown under the message, and taken back by pressing it.
  await menuOf(page, "m3");
  await bubble(page, "m3").getByRole("group", { name: "Thả cảm xúc" }).getByRole("button", { name: "Tim" }).click();
  await expect(bubble(page, "m3").getByRole("button", { name: "Tim: 1" })).toHaveAttribute("aria-pressed", "true");
  await bubble(page, "m3").getByRole("button", { name: "Tim: 1" }).click();
  await expect(bubble(page, "m3").getByRole("button", { name: "Tim: 1" })).toHaveCount(0);
  expect(named(server, "react_to_message")).toEqual([{ p_id: "m3", p_reaction: "heart" }, { p_id: "m3", p_reaction: null }]);

  // One's own new message can be changed; an old one and someone else's cannot.
  await menuOf(page, "m2");
  await expect(bubble(page, "m2").getByRole("button", { name: "Sửa" })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await menuOf(page, "m3");
  await expect(bubble(page, "m3").getByRole("button", { name: "Thu hồi" })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await menuOf(page, mine);
  await bubble(page, mine).getByRole("button", { name: "Sửa" }).click();
  await expect(page.getByText("Đang sửa tin nhắn")).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Tin nhắn" })).toHaveValue("Đi, 7 giờ nhé");
  await page.getByRole("textbox", { name: "Tin nhắn" }).fill("Đi, 7 rưỡi nhé");
  await page.getByRole("button", { name: "Lưu thay đổi" }).click();
  await expect(bubble(page, mine).getByText("Đi, 7 rưỡi nhé")).toBeVisible();
  await expect(bubble(page, mine).getByText("đã sửa")).toBeVisible();
  expect(named(server, "edit_message")).toEqual([{ p_id: mine, p_body: "Đi, 7 rưỡi nhé" }]);

  // Taking a message back asks first, and leaves a line that says so.
  await menuOf(page, mine);
  await bubble(page, mine).getByRole("button", { name: "Thu hồi" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Thu hồi" }).click();
  await expect(bubble(page, mine).getByText("Tin nhắn đã thu hồi")).toBeVisible();
  await expect(bubble(page, mine).getByLabel("Thao tác với tin nhắn")).toHaveCount(0);
  expect(named(server, "delete_message")).toEqual([{ p_id: mine }]);
});

test("chat on a phone: photos are made smaller and sent with the message, what was typed is kept, and a card from another screen is sent along", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page);
  const server = await chatServer(page, [row("m1", kha, "Kha", "Gửi ảnh hôm qua đi", 3)]);
  await page.goto("/chat/c1");
  const box = page.getByRole("textbox", { name: "Tin nhắn" });

  // What is typed and not sent is there again after leaving and coming back.
  await box.fill("Đang viết dở");
  await page.goto("/chat");
  await page.getByRole("link", { name: /Kha/ }).click();
  await expect(box).toHaveValue("Đang viết dở");
  await box.fill("");

  // Two photos: a large one is made smaller on the device before it is sent.
  const large = await page.evaluate(async () => {
    const canvas = document.createElement("canvas"); canvas.width = 3000; canvas.height = 2000;
    const context = canvas.getContext("2d")!;
    for (let index = 0; index < 300; index++) { context.fillStyle = `hsl(${index * 37 % 360} 70% 50%)`; context.fillRect(index * 53 % 3000, index * 97 % 2000, 90, 90); }
    const blob = await new Promise<Blob>(done => canvas.toBlob(file => done(file!), "image/jpeg", 0.95));
    let text = ""; for (const byte of new Uint8Array(await blob.arrayBuffer())) text += String.fromCharCode(byte);
    return btoa(text);
  });
  await page.getByLabel("Thêm ảnh").setInputFiles([{ name: "a.jpg", mimeType: "image/jpeg", buffer: Buffer.from(large, "base64") }, { name: "b.png", mimeType: "image/png", buffer: pixel }]);
  await expect(page.getByRole("list", { name: "Ảnh sắp gửi" }).getByRole("img")).toHaveCount(2);
  await page.getByRole("button", { name: "Bỏ ảnh 2" }).click();
  await expect(page.getByRole("list", { name: "Ảnh sắp gửi" }).getByRole("img")).toHaveCount(1);
  await fits(page);
  await box.fill("Ảnh đây");
  // A message that does not get through comes back whole: the words and the photo, ready to be sent again.
  server.failNextPost = true;
  await page.getByRole("button", { name: "Gửi tin nhắn" }).click();
  await expect(page.getByRole("alert")).toBeVisible();
  await expect(box).toHaveValue("Ảnh đây");
  await expect(page.getByRole("list", { name: "Ảnh sắp gửi" }).getByRole("img")).toHaveCount(1);
  expect(named(server, "post_message")).toHaveLength(0);
  await page.getByRole("button", { name: "Gửi tin nhắn" }).click();
  await expect.poll(() => named(server, "post_message")).toHaveLength(1);
  const sent = named(server, "post_message")[0];
  expect(sent).toMatchObject({ p_body: "Ảnh đây", p_attachments: [{ path: `c1/${sent.p_id}/0.jpg`, width: 1280, height: 853 }] });
  // The first try left a file without a message, which the server's worker removes; the message names its own.
  expect(server.uploads).toHaveLength(2);
  expect(server.uploads[1]).toBe(`chat/c1/${sent.p_id}/0.jpg`);
  // The photo is in the thread and opens full screen.
  await bubble(page, sent.p_id).getByRole("button", { name: "Mở ảnh 1/1" }).click();
  await expect(page.getByRole("dialog").getByRole("img", { name: "Ảnh 1/1" })).toBeVisible();
  await page.getByRole("button", { name: "Đóng ảnh" }).click();
  await fits(page);

  // Taking a photo message back removes its file as well.
  await menuOf(page, sent.p_id);
  await bubble(page, sent.p_id).getByRole("button", { name: "Thu hồi" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Thu hồi" }).click();
  await expect.poll(() => server.removed).toEqual([`c1/${sent.p_id}/0.jpg`]);

  // Another screen hands over a card: it stands above the box, goes with the next message, and opens the thing.
  await page.goto(`/chat/c1?ref=${encodeURIComponent("/meetups/22222222-2222-4222-8222-0000000000ee")}&title=${encodeURIComponent("Ăn tối · 18:00")}`);
  await expect(page).toHaveURL(/\/chat\/c1$/);
  await expect(page.getByText("Ăn tối · 18:00")).toBeVisible();
  await page.getByRole("button", { name: "Gửi tin nhắn" }).click();
  await expect.poll(() => named(server, "post_message")).toHaveLength(2);
  expect(named(server, "post_message")[1]).toMatchObject({ p_body: "", p_ref_path: "/meetups/22222222-2222-4222-8222-0000000000ee", p_ref_title: "Ăn tối · 18:00" });
  await expect(bubble(page, named(server, "post_message")[1].p_id).getByRole("link", { name: "Ăn tối · 18:00" })).toHaveAttribute("href", "/meetups/22222222-2222-4222-8222-0000000000ee");
  // A path that would leave the app is not taken as a card.
  await page.goto(`/chat/c1?ref=${encodeURIComponent("//evil.example/x")}&title=Bẫy`);
  await expect(page.getByRole("textbox", { name: "Tin nhắn" })).toBeVisible();
  await expect(page.getByText("Bẫy")).toHaveCount(0);
});

test("chat: notifications of one conversation are turned off for a while and back on, and an old message is found and gone to", async ({ page }) => {
  await signIn(page);
  const old = Array.from({ length: 30 }, (_, index) => row(`o${index}`, index % 2 ? user.id : kha, index % 2 ? "Vy" : "Kha", index === 3 ? "Mật khẩu wifi quán là cafe2026" : `Tin số ${index}`, 600 - index * 7));
  const server = await chatServer(page, old);
  await page.goto("/chat/c1");
  await page.getByRole("button", { name: "Tùy chọn cuộc trò chuyện" }).click();
  const options = page.getByRole("dialog", { name: "Tùy chọn cuộc trò chuyện" });
  await options.getByRole("button", { name: "8 giờ" }).click();
  await expect(options.getByText(/^Đang tắt thông báo tới /)).toBeVisible();
  expect(named(server, "set_conversation_mute")).toEqual([{ p_conversation_id: "c1", p_minutes: 480 }]);
  await options.getByRole("button", { name: "Bật lại thông báo" }).click();
  await expect(options.getByRole("button", { name: "Tới khi tôi bật lại" })).toBeVisible();
  expect(named(server, "set_conversation_mute")[1]).toEqual({ p_conversation_id: "c1", p_minutes: null });

  await options.getByLabel("Từ cần tìm").fill("wifi");
  await options.getByRole("button", { name: "Tìm", exact: true }).click();
  await options.getByRole("button", { name: /Mật khẩu wifi quán là cafe2026/ }).click();
  await expect(options).toBeHidden();
  await expect(bubble(page, "o3")).toBeInViewport();
});

test("chat: a thread that is open in a tab nobody looks at is not marked as read until the page is on screen again", async ({ page }) => {
  // The page's own word on whether it is on screen, in the test's hands.
  await page.addInitScript(() => {
    const state = window as unknown as { shown?: string };
    state.shown = "hidden";
    Object.defineProperty(document, "visibilityState", { get: () => state.shown });
  });
  await signIn(page);
  const server = await chatServer(page, [row("m1", kha, "Kha", "Tối nay đi không?", 3)], { unread: 1 });
  await page.goto("/chat/c1");
  await expect(page.locator("[data-thread]").getByText("Tối nay đi không?")).toBeVisible();
  // The message is drawn, and nobody has seen it: Kha is not told "Đã xem".
  await page.waitForTimeout(600);
  expect(server.calls.filter(call => call.name === "mark_conversation_read")).toEqual([]);

  await page.evaluate(() => { (window as unknown as { shown?: string }).shown = "visible"; document.dispatchEvent(new Event("visibilitychange")); });
  await expect.poll(() => server.calls.filter(call => call.name === "mark_conversation_read").length).toBe(1);
  // Looking away and back does not ask again for the same message.
  await page.evaluate(() => { document.dispatchEvent(new Event("visibilitychange")); });
  await page.waitForTimeout(300);
  expect(server.calls.filter(call => call.name === "mark_conversation_read")).toHaveLength(1);
});

test("chat in a group: who wrote stands above a run, an admin can take back a member's message, and the thread in English keeps no Vietnamese of the app", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("gnouht-language", "en"));
  await signIn(page);
  const server = await chatServer(page, [row("g1", kha, "Kha", "Hello class", 4), row("g2", kha, "Kha", "Meeting at 3", 3), row("g3", user.id, "Vy", "", 2, { kind: "card", ref_path: "/meetups/1", ref_title: "Dinner · 18:00", has_text: false })], { kind: "group" });
  await page.goto("/chat/c1");
  await expect(bubble(page, "g1").getByText("Kha", { exact: true })).toBeVisible();
  await expect(bubble(page, "g2").getByText("Kha", { exact: true })).toHaveCount(0);
  await menuOf(page, "g2", "Message actions");
  await bubble(page, "g2").getByRole("button", { name: "Unsend" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Unsend" }).click();
  await expect(bubble(page, "g2").getByText("This message was unsent")).toBeVisible();
  expect(named(server, "delete_message")).toEqual([{ p_id: "g2" }]);
  await expect(bubble(page, "g3").getByRole("link", { name: "Dinner · 18:00" })).toBeVisible();
  const vietnamese = /[À-ÖØ-öø-ÿĂăĐđĨĩŨũƠơƯưẠ-ỹ]/;
  const texts = await page.evaluate(() => [...document.body.innerText.split("\n"), ...[...document.querySelectorAll("[aria-label],[placeholder],[title],[alt]")].flatMap(node => ["aria-label", "placeholder", "title", "alt"].map(name => node.getAttribute(name) ?? ""))].map(text => text.trim()).filter(Boolean));
  expect(texts.filter(text => vietnamese.test(text))).toEqual(["Lớp KTPM", "Lớp KTPM"].slice(0, texts.filter(text => vietnamese.test(text)).length));
});

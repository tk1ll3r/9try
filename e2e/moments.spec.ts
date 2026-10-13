import { expect, test, type Page } from "@playwright/test";
import { kha, signIn, user } from "./signedIn";

const lan = "33333333-2222-4222-8222-222222222222";
const fits = (page: Page) => expect.poll(async () => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
const friend = (userId: string, name: string) => ({ user_id: userId, display_name: name, username: name.toLowerCase(), avatar_url: null, status: "accepted", direction: "incoming", created_at: "2026-01-01T00:00:00Z" });
// One pixel, enough for an <img> to load.
const pixel = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");

interface Row { [key: string]: unknown }
const photo = (id: string, owner: string, name: string, minutesAgo: number, extra: Row = {}): Row => ({
  id, owner_id: owner, owner_name: name, owner_avatar_url: null, path: `${owner}/${id}.jpg`, mode: null, caption: "", width: 1080, height: 1350,
  created_at: new Date(Date.now() - minutesAgo * 60_000).toISOString(), expires_at: new Date(Date.now() + (24 * 60 - minutesAgo) * 60_000).toISOString(),
  audience: "friends", seen: owner === user.id, my_reaction: null, views: owner === user.id ? 0 : null, reactions: owner === user.id ? {} : null, ...extra,
});

/** A server that keeps photos the way the database and the bucket would, and records what the app asks of them. */
async function photoServer(page: Page, start: Row[]) {
  const state = { moments: start, calls: [] as { name: string; body: Row }[], uploads: [] as string[], removed: [] as string[], signed: 0, signedPaths: [] as string[][], modes: [] as Row[], customModes: [] as Row[] };
  await page.route("**/rest/v1/**", route => {
    const request = route.request(); const path = new URL(request.url()).pathname.replace(/^.*\/rest\/v1/, "");
    if (path === "/rpc/list_friend_connections") return route.fulfill({ json: [friend(kha, "Kha"), friend(lan, "Lan")] });
    if (path === "/rpc/list_visible_activity_modes") return route.fulfill({ json: [{ user_id: kha, mode: "coffee", updated_at: new Date().toISOString(), expires_at: new Date(Date.now() + 3_600_000).toISOString() }, ...state.modes] });
    if (path === "/custom_activity_modes") return route.fulfill({ json: state.customModes });
    if (path === "/rpc/list_moments") return route.fulfill({ json: [...state.moments].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at))) });
    if (!path.startsWith("/rpc/") || request.method() !== "POST") return route.fulfill({ json: [] });
    const body = (request.postDataJSON() ?? {}) as Row; const name = path.slice(5);
    if (["post_moment", "see_moment", "react_to_moment", "delete_moment", "set_my_activity_mode", "create_my_custom_activity_mode"].includes(name)) state.calls.push({ name, body });
    if (name === "create_my_custom_activity_mode") {
      const mode = `custom_${String(body.p_id).replaceAll("-", "")}`;
      const custom = { mode, label: body.p_label, icon: body.p_icon, color: body.p_color };
      state.customModes.push(custom);
      return route.fulfill({ json: [custom] });
    }
    const target = state.moments.find(moment => moment.id === body.p_id);
    if (name === "post_moment") {
      state.moments.push(photo(String(body.p_id), user.id, "Vy", 0, { mode: body.p_mode, caption: body.p_caption, width: body.p_width, height: body.p_height, audience: body.p_viewer_ids ? "selected" : "friends" }));
      if (body.p_activate_mode) {
        const custom = state.customModes.find(item => item.mode === body.p_mode);
        state.modes = [{ user_id: user.id, mode: body.p_mode, mode_label: custom?.label ?? null, mode_icon: custom?.icon ?? null, mode_color: custom?.color ?? null, updated_at: new Date().toISOString(), expires_at: new Date(Date.now() + Number(body.p_mode_minutes ?? 120) * 60_000).toISOString() }];
      }
    }
    if (name === "see_moment" && target) target.seen = true;
    if (name === "react_to_moment" && target) { target.my_reaction = body.p_reaction; target.seen = true; }
    if (name === "delete_moment" && target) { state.moments = state.moments.filter(moment => moment !== target); return route.fulfill({ json: target.path }); }
    if (name === "set_my_activity_mode") {
      const custom = state.customModes.find(item => item.mode === body.p_mode);
      state.modes = body.p_mode ? [{ user_id: user.id, mode: body.p_mode, mode_label: custom?.label ?? null, mode_icon: custom?.icon ?? null, mode_color: custom?.color ?? null, updated_at: new Date().toISOString(), expires_at: new Date(Date.now() + 3_600_000).toISOString() }] : [];
      return route.fulfill({ json: null });
    }
    if (name === "list_moment_views") return route.fulfill({ json: [{ user_id: kha, display_name: "Kha", avatar_url: null, seen_at: new Date(Date.now() - 150_000).toISOString(), reaction: "fire" }] });
    return route.fulfill({ json: null });
  });
  await page.route("**/storage/v1/object/**", route => {
    const request = route.request(); const path = decodeURIComponent(new URL(request.url()).pathname.replace(/^.*\/storage\/v1\/object\//, ""));
    if (request.method() === "GET") return route.fulfill({ body: pixel, contentType: "image/png" });
    if (path === "sign/moments") {
      const paths = (request.postDataJSON() as { paths: string[] }).paths;
      state.signed++;
      state.signedPaths.push([...paths]);
      return route.fulfill({ json: paths.map(item => ({ path: item, signedURL: `/object/sign/moments/${item}?token=t`, error: null })) });
    }
    if (request.method() === "DELETE") { state.removed.push(...(request.postDataJSON() as { prefixes: string[] }).prefixes); return route.fulfill({ json: [] }); }
    state.uploads.push(path);
    return route.fulfill({ json: { Key: path, Id: "file" } });
  });
  return state;
}

/** Records what a file looked like when it left the page: the app's client keeps the page's own `fetch`. */
const watchUploads = (page: Page) => page.addInitScript(() => {
  const real = window.fetch.bind(window);
  (window as unknown as { uploads: unknown[] }).uploads = [];
  window.fetch = async (input, init) => {
    if (String(input instanceof Request ? input.url : input).includes("/storage/v1/object/moments/") && init?.body instanceof FormData) {
      const file = [...init.body.values()].find(value => value instanceof Blob) as Blob | undefined;
      if (file) {
        const bytes = new Uint8Array(await file.arrayBuffer());
        const text = Array.from(bytes.slice(0, 4000), byte => String.fromCharCode(byte)).join("");
        (window as unknown as { uploads: unknown[] }).uploads.push({ size: file.size, type: file.type, start: [bytes[0], bytes[1]], exif: text.includes("Exif"), secret: text.includes("SECRET-PLACE") });
      }
    }
    return real(input, init);
  };
});

/** A large photo as a phone's camera writes it: a JPEG with a block of details in front of the picture, the place among them. */
async function cameraPhoto(page: Page): Promise<Buffer> {
  const base64 = await page.evaluate(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 2400; canvas.height = 1800;
    const context = canvas.getContext("2d")!;
    const gradient = context.createLinearGradient(0, 0, 2400, 1800);
    gradient.addColorStop(0, "#f7deb0"); gradient.addColorStop(1, "#5f3b26");
    context.fillStyle = gradient; context.fillRect(0, 0, 2400, 1800);
    for (let index = 0; index < 400; index++) { context.fillStyle = `hsl(${index * 37 % 360} 70% 50%)`; context.fillRect(index * 53 % 2400, index * 97 % 1800, 60, 60); }
    const blob = await new Promise<Blob>(done => canvas.toBlob(file => done(file!), "image/jpeg", 0.95));
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let text = ""; for (const byte of bytes) text += String.fromCharCode(byte);
    return btoa(text);
  });
  const jpeg = Buffer.from(base64, "base64");
  const details = Buffer.concat([Buffer.from("Exif\0\0II*\0\x08\0\0\0\0\0", "latin1"), Buffer.from("GPS SECRET-PLACE 10.7725N 106.6980E")]);
  const block = Buffer.concat([Buffer.from([0xff, 0xe1, (details.length + 2) >> 8, (details.length + 2) & 255]), details]);
  return Buffer.concat([jpeg.subarray(0, 2), block, jpeg.subarray(2)]);
}

test("photos on a phone: friends' photos in a frame on Mode, turned by the edges, looked at, and one posted from the camera roll without its place", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await watchUploads(page);
  await signIn(page);
  const server = await photoServer(page, [photo("p-kha-1", kha, "Kha", 200, { seen: true }), photo("p-kha-2", kha, "Kha", 12, { mode: "coffee", caption: "Quán mới gần trường" }), photo("p-lan", lan, "Lan", 50)]);
  await page.goto("/");

  // The newest photo not looked at yet comes first, with who, when, the activity and the line.
  const frame = page.getByRole("region", { name: "Khoảnh khắc" });
  await expect(frame.getByRole("img", { name: "Ảnh của Kha: Quán mới gần trường" })).toBeVisible();
  await expect(frame.getByText("12 phút trước")).toBeVisible();
  await expect(frame.getByText("Cà phê")).toBeVisible();
  await expect(frame.getByText("Ảnh 1/3 trong story 24 giờ.")).toBeVisible();
  // One request signs the photo on screen and the ones a swipe or a tap can reach next.
  expect(server.signed).toBe(1);
  expect(server.signedPaths[0].slice().sort()).toEqual([`${kha}/p-kha-1.jpg`, `${kha}/p-kha-2.jpg`, `${lan}/p-lan.jpg`].sort());
  // Being on screen for a moment counts as looked at.
  await expect.poll(() => server.calls.filter(call => call.name === "see_moment").map(call => call.body.p_id)).toEqual(["p-kha-2"]);
  await fits(page);

  await frame.getByRole("button", { name: "Ảnh sau" }).click();
  await expect(frame.getByRole("img", { name: "Ảnh của Lan" })).toBeVisible();
  await expect.poll(() => server.calls.filter(call => call.name === "see_moment").length).toBe(2);
  await frame.getByRole("button", { name: "Ảnh trước" }).click();
  await expect(frame.getByRole("img", { name: "Ảnh của Kha: Quán mới gần trường" })).toBeVisible();
  // A friend who has a mode on and a photo carries a camera, and their face opens the photos.
  await expect(page.getByRole("link", { name: "Kha: Cà phê" })).toHaveAttribute("href", `/moments/${kha}/p-kha-2`);

  // Posting: the photo is made smaller on the device, and what the camera wrote about the place stays behind.
  const file = await cameraPhoto(page);
  expect(file.includes("SECRET-PLACE")).toBe(true);
  await frame.getByRole("button", { name: "Đăng ảnh" }).click();
  const dialog = page.getByRole("dialog", { name: "Đăng ảnh" });
  await dialog.getByLabel("Chọn ảnh có sẵn").setInputFiles({ name: "IMG_0412.jpg", mimeType: "image/jpeg", buffer: file });
  await expect(dialog.getByRole("img", { name: "Ảnh sắp đăng" })).toBeVisible();
  await dialog.getByLabel("Chú thích (không bắt buộc)").fill("Học nhóm ở thư viện");
  await dialog.getByRole("button", { name: "Học bài" }).click();
  await expect(dialog.getByText("Mode này sẽ được bật cho bạn khi đăng ảnh.")).toBeVisible();
  await fits(page);
  await dialog.getByRole("button", { name: "Đăng", exact: true }).click();
  await expect(dialog).toBeHidden();

  const sent = await page.evaluate(() => (window as unknown as { uploads: { size: number; type: string; start: number[]; exif: boolean; secret: boolean }[] }).uploads);
  expect(sent).toHaveLength(1);
  expect(sent[0]).toMatchObject({ type: "image/jpeg", start: [0xff, 0xd8], exif: false, secret: false });
  expect(sent[0].size).toBeLessThanOrEqual(300_000);
  const posted = server.calls.find(call => call.name === "post_moment")!.body;
  expect(posted).toMatchObject({ p_width: 1080, p_height: 810, p_mode: "studying", p_caption: "Học nhóm ở thư viện", p_viewer_ids: null });
  expect(server.uploads).toEqual([`moments/${user.id}/${posted.p_id}.jpg`]);
  // The activity of the photo is turned on in the same transaction as the photo.
  expect(posted).toMatchObject({ p_activate_mode: true, p_mode_minutes: 120 });
  expect(server.calls.some(call => call.name === "set_my_activity_mode")).toBe(false);
  await expect(frame.getByText("Ảnh 1/4 trong story 24 giờ.")).toBeVisible();
});

test("one person's photos: a reaction, a reply that opens the chat with the photo attached, and one's own photo with who looked and a way to remove it", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page);
  const server = await photoServer(page, [photo("p-kha-1", kha, "Kha", 200, { seen: true }), photo("p-kha-2", kha, "Kha", 12, { caption: "Quán mới gần trường" }),
    photo("p-mine", user.id, "Vy", 30, { views: 1, reactions: { fire: 1 }, caption: "Thư viện" })]);
  await page.route("**/rest/v1/rpc/open_direct_conversation", route => route.fulfill({ json: "c-kha" }));
  await page.route("**/rest/v1/rpc/list_conversations", route => route.fulfill({ json: [{ id: "c-kha", kind: "direct", title: "Kha", other_user_id: kha, last_message_at: null, last_message_body: null, unread_count: 0 }] }));
  await page.goto(`/moments/${kha}`);

  // A friend's photos open on the first one not looked at yet.
  const khas = page.getByRole("article", { name: "Ảnh của Kha" });
  await expect(khas.getByRole("img", { name: "Ảnh của Kha: Quán mới gần trường" })).toBeVisible();
  await expect(khas.getByText("12 phút trước · ảnh 2/2")).toBeVisible();
  await khas.getByRole("group", { name: "Thả cảm xúc" }).getByRole("button", { name: "Lửa" }).click();
  await expect(khas.getByRole("button", { name: "Lửa" })).toHaveAttribute("aria-pressed", "true");
  expect(server.calls.find(call => call.name === "react_to_moment")!.body).toEqual({ p_id: "p-kha-2", p_reaction: "fire" });
  // The arrow keys turn the page; past the last photo of one person come the next person's.
  await page.keyboard.press("ArrowLeft");
  await expect(khas.getByText(/ảnh 1\/2$/)).toBeVisible();
  await fits(page);

  await page.goto(`/moments/${kha}`);
  await page.getByRole("link", { name: "Trả lời" }).click();
  await expect(page).toHaveURL(/\/chat\/c-kha$/);
  // The photo is attached to the first message as a card.
  await expect(page.getByText(/^Ảnh của Kha lúc \d{2}:\d{2}$/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Bỏ mục đính kèm" })).toBeVisible();

  // One's own photo: who looked, with what, and a button that removes it for everyone, file included.
  await page.goto(`/moments/${user.id}`);
  const mine = page.getByRole("article", { name: "Ảnh của Bạn" });
  await expect(mine.getByText("Ảnh này hiện với mọi bạn bè của bạn.")).toBeVisible();
  await mine.getByRole("button", { name: "1 người đã xem" }).click();
  await expect(mine.getByRole("listitem").filter({ hasText: "Kha" })).toContainText("2 phút trước");
  await mine.getByRole("button", { name: "Xóa ảnh" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Xóa ảnh" }).click();
  await expect(page).toHaveURL(/\/$/);
  expect(server.calls.find(call => call.name === "delete_moment")!.body).toEqual({ p_id: "p-mine" });
  expect(server.removed).toEqual([`${user.id}/p-mine.jpg`]);
});

test("an exact photo link opens that photo, and an expired or unavailable target never falls back to the newest one", async ({ page }) => {
  await signIn(page);
  await photoServer(page, [photo("p-kha-old", kha, "Kha", 200, { seen: true, caption: "Ảnh cũ" }), photo("p-kha-new", kha, "Kha", 12, { caption: "Ảnh mới" })]);
  await page.goto(`/moments/${kha}/p-kha-old`);
  const article = page.getByRole("article", { name: "Ảnh của Kha" });
  await expect(article.getByRole("img", { name: "Ảnh của Kha: Ảnh cũ" })).toBeVisible();
  await expect(article.getByText("3 giờ trước · ảnh 1/2")).toBeVisible();

  await page.goto(`/moments/${kha}/not-a-visible-photo`);
  await expect(page.getByText("Ảnh này không còn, đã hết hạn hoặc bạn không thể xem.")).toBeVisible();
  await expect(page.getByRole("article", { name: "Ảnh của Kha" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Mở ảnh còn lại của người này" })).toHaveAttribute("href", `/moments/${kha}`);
});

test("custom modes can be created in Mode and activated while posting a photo", async ({ page }) => {
  await signIn(page);
  const server = await photoServer(page, []);
  await page.goto("/");
  await page.getByRole("button", { name: "Mọi hoạt động" }).click();
  const picker = page.getByRole("dialog", { name: "Mode của bạn" });
  await picker.getByRole("button", { name: "Tạo mode", exact: true }).click();
  const modeDialog = page.getByRole("dialog", { name: "Tạo mode riêng" });
  await modeDialog.getByLabel("Tên mode").fill("Đi dạo");
  await modeDialog.getByRole("button", { name: "Tạo mode", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Đi dạo" })).toBeVisible();
  expect(server.calls.find(call => call.name === "set_my_activity_mode")?.body.p_mode).toMatch(/^custom_[0-9a-f]{32}$/);

  await page.getByRole("button", { name: "Chụp khoảnh khắc" }).click();
  const composer = page.getByRole("dialog", { name: "Đăng ảnh" });
  await composer.getByLabel("Chọn ảnh có sẵn").setInputFiles({ name: "photo.png", mimeType: "image/png", buffer: pixel });
  await expect(composer.getByRole("img", { name: "Ảnh sắp đăng" })).toBeVisible();
  await composer.getByRole("button", { name: "Tạo mode riêng" }).click();
  const createDialog = page.getByRole("dialog", { name: "Tạo mode riêng" });
  await createDialog.getByLabel("Tên mode").fill("Đọc sách");
  await createDialog.getByRole("button", { name: "Tạo mode", exact: true }).click();
  await expect(composer.getByRole("button", { name: "Đọc sách" })).toHaveAttribute("aria-pressed", "true");
  await composer.getByRole("button", { name: "Đăng", exact: true }).click();
  await expect(composer).toBeHidden();
  const posted = server.calls.filter(call => call.name === "post_moment").at(-1)!.body;
  expect(posted).toMatchObject({ p_activate_mode: true, p_mode_minutes: 120 });
  expect(posted.p_mode).toMatch(/^custom_[0-9a-f]{32}$/);
});

test("without photos the frame is one line with a camera, and the privacy screen says nothing is showing", async ({ page }) => {
  await signIn(page);
  await photoServer(page, []);
  await page.goto("/");
  const frame = page.getByRole("region", { name: "Khoảnh khắc" });
  await expect(frame.getByText("Chưa có ảnh nào trong 24 giờ qua. Đăng một tấm để bạn bè thấy bạn đang làm gì.")).toBeVisible();
  expect((await frame.boundingBox())!.height).toBeLessThan(170);
  await frame.getByRole("button", { name: "Đăng ảnh" }).click();
  await expect(page.getByRole("dialog", { name: "Đăng ảnh" }).getByText("Chụp ảnh")).toBeVisible();
  await page.keyboard.press("Escape");

  await page.goto("/me/privacy");
  await expect(page.getByText("Không có story ảnh nào đang hiện với bạn bè. Ảnh hết hạn vẫn được giữ trong kho lưu trữ.")).toBeVisible();
});

test("photos for chosen people: someone chosen last time who is no longer a friend is left out, and with nobody left the photo is not posted", async ({ page }) => {
  const gone = "99999999-9999-4999-8999-999999999999";
  // What the device remembers from the last photo: Kha, and someone who was a friend then.
  await page.addInitScript(ids => { if (!sessionStorage.getItem("set")) { sessionStorage.setItem("set", "1"); localStorage.setItem("gnouht-moment-viewers", JSON.stringify(ids)); } }, [gone, kha]);
  await signIn(page);
  const server = await photoServer(page, []);
  await page.goto("/");
  const frame = page.getByRole("region", { name: "Khoảnh khắc" });
  await frame.getByRole("button", { name: "Đăng ảnh" }).click();
  const dialog = page.getByRole("dialog", { name: "Đăng ảnh" });
  await dialog.getByLabel("Chọn ảnh có sẵn").setInputFiles({ name: "IMG_0413.jpg", mimeType: "image/jpeg", buffer: await cameraPhoto(page) });
  await expect(dialog.getByRole("img", { name: "Ảnh sắp đăng" })).toBeVisible();
  // The choice of last time is kept: chosen people, and of them the one who is still a friend.
  await expect(dialog.getByRole("button", { name: "Chỉ những người tôi chọn" })).toHaveAttribute("aria-pressed", "true");
  await expect(dialog.getByRole("checkbox", { name: "Kha" })).toBeChecked();
  await expect(dialog.getByRole("checkbox", { name: "Lan" })).not.toBeChecked();
  // With nobody chosen there is nobody to post for: the photo never goes to every friend instead.
  await dialog.getByRole("checkbox", { name: "Kha" }).uncheck();
  await expect(dialog.getByRole("button", { name: "Đăng", exact: true })).toBeDisabled();
  await dialog.getByRole("checkbox", { name: "Kha" }).check();
  await dialog.getByRole("button", { name: "Đăng", exact: true }).click();
  await expect(dialog).toBeHidden();
  expect(server.calls.find(call => call.name === "post_moment")!.body.p_viewer_ids).toEqual([kha]);
});

test("photos in English: the frame, a person's photos and the form to post one keep no Vietnamese of the app", async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem("gnouht-language", "en"));
  await signIn(page);
  await photoServer(page, [photo("p-kha", kha, "Kha", 12, { mode: "coffee" }), photo("p-mine", user.id, "Vy", 30, { views: 2 })]);
  const vietnamese = /[À-ÖØ-öø-ÿĂăĐđĨĩŨũƠơƯưẠ-ỹ]/;
  const texts = () => page.evaluate(() => [...document.body.innerText.split("\n"), ...[...document.querySelectorAll("[aria-label],[placeholder],[title],[alt]")].flatMap(node => ["aria-label", "placeholder", "title", "alt"].map(name => node.getAttribute(name) ?? ""))].map(text => text.trim()).filter(Boolean));
  await page.goto("/");
  const frame = page.getByRole("region", { name: "Moments" });
  await expect(frame.getByRole("img", { name: "Photo by Kha" })).toBeVisible();
  await frame.getByRole("button", { name: "Post a photo" }).click();
  await expect(page.getByRole("dialog", { name: "Post a photo" })).toBeVisible();
  expect((await texts()).filter(text => vietnamese.test(text))).toEqual([]);
  await page.goto(`/moments/${user.id}`);
  await expect(page.getByRole("button", { name: "2 people looked" })).toBeVisible();
  expect((await texts()).filter(text => vietnamese.test(text))).toEqual([]);
});

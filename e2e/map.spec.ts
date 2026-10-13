import { expect, test, type Page } from "@playwright/test";
import { bareMap, kha, signIn } from "./signedIn";

interface Row { [key: string]: unknown }
const lan = "33333333-3333-4333-8333-333333333333";
const thu = "44444444-4444-4444-8444-444444444444";
// The viewer stands at Ben Thanh market in these tests.
const market = { latitude: 10.7725, longitude: 106.698, accuracy: 35 };

const sharing = (id: string, name: string, extra: Row = {}): Row => ({
  session_id: `s-${name}`, owner_id: id, owner_display_name: name, owner_username: name.toLowerCase(), expires_at: new Date(Date.now() + 3_600_000).toISOString(),
  approximate: false, latitude: 10.7767, longitude: 106.7036, accuracy_m: 8, recorded_at: new Date().toISOString(), ...extra,
});
/** Kha is exact and fresh, Lan shares a rounded position, Thu's position is five minutes old. */
const three = () => [
  sharing(kha, "Kha"),
  sharing(lan, "Lan", { approximate: true, latitude: 10.781, longitude: 106.69, accuracy_m: 100 }),
  sharing(thu, "Thu", { latitude: 10.76, longitude: 106.7, recorded_at: new Date(Date.now() - 300_000).toISOString() }),
];

// A picture as a profile stores it: a data URL. Kha has one; the others show their initial.
const picture = "data:image/svg+xml;utf8,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 8 8'%3E%3Crect width='8' height='8' fill='%23f59e0b'/%3E%3C/svg%3E";

/**
 * A map without a tile service, and a backend that answers the list of friends from `state` and
 * records every request body. `modes` are what the friends say they are doing.
 */
async function mapServer(page: Page, state: { friends: Row[]; modes?: Row[] }, sent: string[] = []) {
  await bareMap(page);
  await page.route("**/rest/v1/**", route => {
    const request = route.request(); const path = new URL(request.url()).pathname.replace(/^.*\/rest\/v1/, "");
    sent.push(`${request.method()} ${path} ${request.postData() ?? ""}`);
    if (path === "/rpc/list_visible_locations") return route.fulfill({ json: state.friends });
    if (path === "/rpc/list_visible_activity_modes") return route.fulfill({ json: state.modes ?? [] });
    if (path === "/rpc/list_friend_connections") return route.fulfill({ json: state.friends.map(friend => ({ user_id: friend.owner_id, display_name: friend.owner_display_name, username: friend.owner_username, avatar_url: friend.owner_id === kha ? picture : null, status: "accepted", direction: "incoming", created_at: "2026-01-01T00:00:00Z" })) });
    return route.fulfill({ json: [] });
  });
}
const doing = (id: string, mode: string): Row => ({ user_id: id, mode, updated_at: new Date(Date.now() - 600_000).toISOString(), expires_at: new Date(Date.now() + 3_000_000).toISOString() });
const marker = (page: Page, name: string) => page.locator(`.maplibregl-marker[aria-label="Vị trí ${name}"]`);
const place = async (page: Page, name: string) => { const box = (await marker(page, name).boundingBox())!; return { x: Math.round(box.x), y: Math.round(box.y) }; };

test("map: my location is a dot on this device, with straight-line distances, and nothing about it is sent", async ({ page, context }) => {
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation(market);
  await signIn(page);
  const sent: string[] = [];
  await mapServer(page, { friends: three() }, sent);
  await page.goto("/me/location");
  await expect(page.locator(".maplibregl-marker")).toHaveCount(3);

  // Until they ask, the browser is not asked, and no distance is claimed.
  const list = page.locator("#location-friends");
  await expect(page.getByTestId("my-position")).toHaveCount(0);
  await expect(list.getByText("Bấm “Vị trí của tôi” trên bản đồ để biết bạn cách mỗi người bao xa.", { exact: false })).toBeVisible();
  await expect(list.getByText(/Cách bạn/)).toHaveCount(0);

  await page.getByRole("button", { name: "Vị trí của tôi" }).click();
  await expect(page.getByTestId("my-position")).toBeVisible();
  await expect(page.getByText("Chấm xanh là bạn (±35 m). Vị trí này chỉ ở trên máy của bạn và không được gửi cho ai.")).toBeVisible();
  // The circle around the dot is 35 m of ground: at the zoom the map flew to, that is wider than the dot.
  await expect.poll(async () => (await page.getByTestId("my-position").locator("div").first().boundingBox())?.width ?? 0).toBeGreaterThan(20);

  // An exact friend, one who shares a rounded position, and one whose position is old.
  const row = (name: string) => list.getByRole("button", { name: new RegExp(`^${name}`) });
  await expect(row("Kha")).toContainText("Đang cập nhật");
  await expect(row("Kha")).toContainText("Cách bạn 770 m theo đường thẳng");
  await expect(row("Lan")).toContainText("gần đúng");
  await expect(row("Lan")).toContainText("Cách bạn khoảng 1,3 km theo đường thẳng");
  await expect(row("Thu")).toContainText("Tạm dừng");
  await expect(row("Thu")).toContainText("Cách bạn 1,4 km theo đường thẳng · tính từ vị trí cũ");
  // On the map the three look different: breathing, dashed rim, grey.
  await expect(marker(page, "Kha").locator("div")).toHaveClass(/marker-live/);
  await expect(marker(page, "Lan").locator("div")).toHaveClass(/marker-rough/);
  await expect(marker(page, "Thu").locator("div")).toHaveClass(/marker-old/);
  await expect(marker(page, "Thu").locator("div")).not.toHaveClass(/marker-live/);

  // Nothing was stored or started, and the position is in no request at all.
  expect(sent.filter(request => /location_positions|start_location_session|10\.7725|106\.698/.test(request))).toEqual([]);
  expect(sent.some(request => request.includes("/rpc/list_visible_locations"))).toBe(true);
});

test("map: a refused permission is said in words, the list keeps working, and asking again works once it is allowed", async ({ page }) => {
  await signIn(page);
  await mapServer(page, { friends: three() });
  // The browser's answer, in the test's hands: refuse first, then allow.
  await page.addInitScript(here => {
    const state = window as unknown as { allowGps?: boolean };
    navigator.geolocation.watchPosition = (found, refused) => {
      if (state.allowGps) found({ coords: { ...here, altitude: null, altitudeAccuracy: null, heading: null, speed: null }, timestamp: Date.now() } as unknown as GeolocationPosition);
      else refused?.({ code: 1, message: "User denied Geolocation", PERMISSION_DENIED: 1, POSITION_UNAVAILABLE: 2, TIMEOUT: 3 } as GeolocationPositionError);
      return 1;
    };
  }, market);
  await page.goto("/me/location");
  await expect(page.locator(".maplibregl-marker")).toHaveCount(3);

  await page.getByRole("button", { name: "Vị trí của tôi" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Trình duyệt đang chặn định vị với trang này." })).toBeVisible();
  await expect(page.getByTestId("my-position")).toHaveCount(0);
  // The friends are still there, without a distance.
  const list = page.locator("#location-friends");
  await expect(list.getByRole("button", { name: /^Kha/ })).toContainText("Đang cập nhật");
  await expect(list.getByText(/Cách bạn/)).toHaveCount(0);

  await page.evaluate(() => { (window as unknown as { allowGps?: boolean }).allowGps = true; });
  await page.getByRole("button", { name: "Vị trí của tôi" }).click();
  await expect(page.getByTestId("my-position")).toBeVisible();
  await expect(page.getByRole("alert").filter({ hasText: "Trình duyệt đang chặn định vị" })).toHaveCount(0);
  await expect(list.getByRole("button", { name: /^Kha/ })).toContainText("Cách bạn 770 m theo đường thẳng");
});

test("map: fifty friends keep their markers while labels tick, the list reloads and people move, and the camera stays put", async ({ page }) => {
  const start = Date.now();
  const friends: Row[] = Array.from({ length: 50 }, (_, index) => sharing(`${String(index + 10).padStart(8, "0")}-2222-4222-8222-222222222222`, `Bạn ${index + 1}`, {
    latitude: 10.76 + (index % 10) * 0.004, longitude: 106.68 + Math.floor(index / 10) * 0.006, recorded_at: new Date(start).toISOString(),
  }));
  // "Bạn 3" sent its position 55 seconds ago: it turns old while the test watches.
  friends[2].recorded_at = new Date(start - 55_000).toISOString();
  const state = { friends };
  await signIn(page);
  await mapServer(page, state);
  await page.clock.install({ time: start });
  await page.goto("/me/location");
  await expect(page.locator(".maplibregl-marker")).toHaveCount(50);
  await expect(marker(page, "Bạn 3").locator("div")).toHaveClass(/marker-live/);
  await page.evaluate(() => document.querySelectorAll(".maplibregl-marker").forEach(element => element.setAttribute("data-kept", "")));

  // The person looks somewhere else on the map. That view is theirs from now on.
  const map = (await page.getByTestId("map-container").boundingBox())!;
  await page.mouse.move(map.x + 40, map.y + 40);
  await page.mouse.down();
  await page.mouse.move(map.x + 100, map.y + 90, { steps: 6 });
  await page.mouse.up();
  let before = await place(page, "Bạn 10");
  await expect.poll(async () => { const now = await place(page, "Bạn 10"); const still = now.x === before.x && now.y === before.y; before = now; return still; }).toBe(true);
  const movedBefore = await place(page, "Bạn 2");

  // Ten seconds on, the labels are drawn again and "Bạn 3" is a minute old. Same fifty elements; one changed its look.
  await page.clock.fastForward(11_000);
  await expect(marker(page, "Bạn 3").locator("div")).toHaveClass(/marker-old/);
  await expect(page.locator(".maplibregl-marker[data-kept]")).toHaveCount(50);
  expect(await place(page, "Bạn 10")).toEqual(before);

  // Then the list reloads: one friend moved north, one stopped sharing, one started.
  friends[1] = { ...friends[1], latitude: Number(friends[1].latitude) + 0.003, recorded_at: new Date(start + 14_000).toISOString() };
  friends.pop();
  friends.push(sharing(lan, "Lan", { latitude: 10.77, longitude: 106.69, recorded_at: new Date(start + 14_000).toISOString() }));
  await page.clock.fastForward(16_000);
  await expect(marker(page, "Lan")).toHaveCount(1);
  await expect(marker(page, "Bạn 50")).toHaveCount(0);
  await expect(page.locator(".maplibregl-marker")).toHaveCount(50);
  // 49 are the elements from the start; the newcomer is the only new one.
  await expect(page.locator(".maplibregl-marker[data-kept]")).toHaveCount(49);
  // The one who moved is higher on the screen. Nobody else moved, so the camera did not.
  await expect.poll(async () => (await place(page, "Bạn 2")).y).toBeLessThan(movedBefore.y);
  expect((await place(page, "Bạn 2")).x).toBe(movedBefore.x);
  expect(await place(page, "Bạn 10")).toEqual(before);
});

test("map on a phone: the map has the screen, and the list and the sharing form are a sheet over it with three heights", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page);
  const more = ["An", "Bình", "Chi", "Dũng"].map((name, index) => sharing(`${index + 5}5555555-5555-4555-8555-555555555555`, name, { latitude: 10.79 + index * 0.003, longitude: 106.71 }));
  await mapServer(page, { friends: [...three(), ...more] });
  await page.goto("/me/location");
  await expect(page.locator(".maplibregl-marker")).toHaveCount(7);
  const fits = () => expect.poll(async () => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);

  // The map runs from under the title to the bar at the foot of the screen.
  const frame = async () => (await page.getByTestId("map-container").boundingBox())!;
  expect((await frame()).height).toBeGreaterThan(844 * 0.6);
  expect((await frame()).y + (await frame()).height).toBeLessThanOrEqual(844 - 80);
  await fits();

  // Folded: who is sharing, as faces, and nothing of the list to reach.
  const sheet = page.getByTestId("map-sheet");
  const list = page.locator("#location-friends");
  await expect(sheet).toHaveAttribute("data-height", "peek");
  await expect(sheet.getByText("7 người đang chia sẻ")).toBeVisible();
  await expect(sheet.getByRole("button", { name: /^Xem .* trên bản đồ$/ })).toHaveCount(5);
  await expect(sheet.getByText("+2")).toBeVisible();
  await expect(list).toBeHidden();
  await expect(page.getByRole("heading", { name: "Chia sẻ vị trí của bạn" })).toBeHidden();
  expect((await sheet.boundingBox())!.height).toBeLessThan(100);

  // The bar at its top steps through the three heights, and says where it is.
  const bar = sheet.getByRole("button", { name: /^Bảng đang/ });
  await expect(bar).toHaveAccessibleName("Bảng đang thu gọn. Bấm để mở danh sách.");
  await expect(bar).toHaveAttribute("aria-expanded", "false");
  await bar.press("Enter");
  await expect(sheet).toHaveAttribute("data-height", "half");
  await expect(bar).toHaveAccessibleName("Bảng đang mở danh sách. Bấm để mở hết.");
  await expect(bar).toHaveAttribute("aria-expanded", "true");
  await expect(page.getByRole("heading", { name: "Bạn bè đang chia sẻ · 7" })).toBeVisible();
  await expect(list.getByRole("listitem")).toHaveCount(7);
  await bar.press("Enter");
  await expect(sheet).toHaveAttribute("data-height", "full");
  await expect(bar).toHaveAccessibleName("Bảng đang mở hết. Bấm để thu gọn.");
  // All the way up, the map's own buttons are still above the sheet.
  await expect.poll(async () => (await sheet.boundingBox())!.y - (await frame()).y).toBeGreaterThan(60);
  await bar.press("Enter");
  await expect(sheet).toHaveAttribute("data-height", "peek");
  await expect(list).toBeHidden();

  // A finger drags it by its head, and it stops at the nearest of the three.
  const drag = async (by: number) => {
    const box = (await bar.boundingBox())!;
    const [x, y] = [box.x + box.width / 2, box.y + box.height / 2];
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x, y - by / 2, { steps: 4 });
    await page.mouse.move(x, y - by, { steps: 4 });
    await page.mouse.up();
  };
  await drag(230);
  await expect(sheet).toHaveAttribute("data-height", "half");
  await drag(400);
  await expect(sheet).toHaveAttribute("data-height", "full");
  await drag(-170);
  await expect(sheet).toHaveAttribute("data-height", "half");
  await fits();

  // Search reads names without their marks.
  await list.getByRole("searchbox", { name: "Tìm bạn trên bản đồ" }).fill("binh");
  await expect(list.getByRole("listitem")).toHaveText([/^Bình/]);
  await list.getByRole("searchbox").fill("zzz");
  await expect(list.getByText("Không ai đang chia sẻ có tên như vậy.")).toBeVisible();
  await list.getByRole("searchbox").fill("lan");

  // Choosing a person folds the sheet and puts that person in the middle of the map.
  await list.getByRole("button", { name: /^Lan/ }).click();
  await expect(sheet).toHaveAttribute("data-height", "peek");
  await expect(page.getByTestId("map-container")).toBeInViewport({ ratio: 0.9 });
  const centered = (name: string) => expect.poll(async () => {
    const box = await frame(); const at = (await marker(page, name).boundingBox())!;
    return Math.abs(at.x + at.width / 2 - (box.x + box.width / 2)) < 3 && Math.abs(at.y + at.height / 2 - (box.y + box.height / 2)) < 3;
  }).toBe(true);
  await centered("Lan");
  // So does a face in the folded sheet.
  await sheet.getByRole("button", { name: "Xem Thu trên bản đồ" }).click();
  await centered("Thu");
  await expect(sheet).toHaveAttribute("data-height", "peek");

  // Sharing is one press away from the top of the screen.
  await page.getByRole("button", { name: "Chia sẻ vị trí", exact: true }).click();
  await expect(sheet).toHaveAttribute("data-height", "full");
  await expect(page.locator("#location-sharing")).toBeFocused();
  await expect(page.getByRole("heading", { name: "Chia sẻ vị trí của bạn" })).toBeInViewport();
  // What the marks mean is at the foot of the sheet.
  await expect(sheet.getByText("Gần đúng, trong khoảng 100 m")).toBeVisible();

  // The smallest phone: nothing is wider than the screen, folded or open.
  await page.setViewportSize({ width: 320, height: 568 });
  await fits();
  await bar.press("Enter");
  await expect(sheet).toHaveAttribute("data-height", "peek");
  await fits();
});

test("map frame stays above the fixed phone bar on small iPhone and Android viewports", async ({ page }) => {
  await signIn(page);
  await mapServer(page, { friends: [] });
  await page.goto("/me/location");
  await expect(page.getByRole("heading", { name: "Bản đồ bạn bè" })).toBeVisible();

  // Short iPhone SE portrait, common iPhone portrait, Android portrait, and phone landscape.
  for (const viewport of [
    { width: 320, height: 568 },
    { width: 390, height: 844 },
    { width: 412, height: 915 },
    { width: 844, height: 390 },
  ]) {
    await page.setViewportSize(viewport);
    await expect.poll(async () => page.evaluate(() => {
      const map = document.querySelector<HTMLElement>("[data-testid=map-container]")!;
      const bars = document.querySelectorAll<HTMLElement>('nav[aria-label="Điều hướng chính"]');
      return document.documentElement.scrollWidth <= innerWidth
        && map.getBoundingClientRect().bottom <= bars[bars.length - 1].getBoundingClientRect().top + 1;
    })).toBe(true);
    const layout = await page.evaluate(() => {
      const map = document.querySelector<HTMLElement>("[data-testid=map-container]")!;
      const bars = document.querySelectorAll<HTMLElement>('nav[aria-label="Điều hướng chính"]');
      const bar = bars[bars.length - 1];
      return {
        documentWidth: document.documentElement.scrollWidth,
        viewportWidth: innerWidth,
        mapBottom: map.getBoundingClientRect().bottom,
        barTop: bar.getBoundingClientRect().top,
      };
    });
    expect(layout.documentWidth, `horizontal overflow at ${viewport.width}×${viewport.height}`).toBeLessThanOrEqual(layout.viewportWidth);
    expect(layout.mapBottom, `map covered by the fixed bar at ${viewport.width}×${viewport.height}`).toBeLessThanOrEqual(layout.barTop + 1);
  }
});

test("map on a phone: when the map cannot load, the list of friends is open and my location still works", async ({ page, context }) => {
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation(market);
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page);
  await mapServer(page, { friends: three() });
  await page.route("**/map/*.json", route => route.fulfill({ status: 503, body: "unavailable" }));
  await page.goto("/me/location");
  await expect(page.getByRole("alert").filter({ hasText: "Không tải được tài nguyên bản đồ" })).toBeVisible();

  // The sheet is up by itself: the list is how the people are seen now.
  const list = page.locator("#location-friends");
  await expect(page.getByTestId("map-sheet")).toHaveAttribute("data-height", "full");
  await expect(list.getByRole("button", { name: /^Kha/ })).toBeVisible();
  await page.getByRole("button", { name: "Vị trí của tôi" }).click();
  await expect(list.getByRole("button", { name: /^Kha/ })).toContainText("Cách bạn 770 m theo đường thẳng");
});

test("map: a friend is a face with the color of what they are doing, a name from close up, and a card with a way to write to them", async ({ page, context }) => {
  await context.grantPermissions(["geolocation"]);
  await context.setGeolocation(market);
  await signIn(page);
  await mapServer(page, { friends: three(), modes: [doing(kha, "coffee")] });
  await page.goto("/me/location");
  await expect(page.locator(".maplibregl-marker")).toHaveCount(3);

  // Kha has a picture and is having coffee; Lan has neither.
  const face = (name: string) => marker(page, name).locator("div");
  await expect(face("Kha").locator("img")).toHaveAttribute("src", picture);
  await expect(face("Kha")).toHaveAttribute("data-mode", "");
  expect(await face("Kha").evaluate(element => (element as HTMLElement).style.getPropertyValue("--mode"))).toBe("#a16207");
  await expect(face("Lan")).toHaveText("L");
  await expect(face("Lan")).not.toHaveAttribute("data-mode");

  // From far, faces only. Close up, each has its name under it.
  await expect(marker(page, "Kha").locator(".map-name")).toBeHidden();
  await page.locator("#location-friends").getByRole("button", { name: /^Kha/ }).click();
  await expect(marker(page, "Kha").locator(".map-name")).toBeVisible();
  await expect(marker(page, "Kha").locator(".map-name")).toHaveText("Kha");

  // A press on the face opens the person's card: who, what they are doing, how far, and a way to write.
  await page.getByRole("button", { name: "Vị trí của tôi" }).click();
  await expect(page.getByTestId("my-position")).toBeVisible();
  await marker(page, "Kha").press("Enter");
  const card = page.locator(".maplibregl-popup");
  await expect(card).toContainText("Kha");
  await expect(card).toContainText("Cà phê");
  await expect(card).toContainText("Mới cập nhật");
  await expect(card).toContainText("Cách bạn 770 m theo đường thẳng");
  await expect(card.getByRole("link", { name: "Nhắn tin" })).toHaveAttribute("href", `/chat/with/${kha}`);
  // The card is the app's own: its surface color, no white box.
  expect(await card.locator(".maplibregl-popup-content").evaluate(element => getComputedStyle(element).backgroundColor)).toBe("rgb(255, 251, 253)");
  // The viewer's dot is the calendar's blue, a token of the app.
  expect(await page.getByTestId("my-position").locator(".map-me").evaluate(element => getComputedStyle(element).backgroundColor)).toBe("rgb(11, 116, 196)");
  await marker(page, "Kha").press("Enter");
  await expect(card).toHaveCount(0);
});

test("map: the style follows the look, and the same map and markers stay", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "light" });
  await signIn(page);
  const styles: string[] = [];
  page.on("request", request => { if (/\/map\/(light|dark)\.json$/.test(request.url())) styles.push(new URL(request.url()).pathname); });
  await mapServer(page, { friends: three() });
  await page.goto("/me/location");
  await expect(page.locator(".maplibregl-marker")).toHaveCount(3);
  const map = page.getByTestId("map-container");
  await expect(map).toHaveAttribute("data-map-look", "light");
  expect(styles).toEqual(["/map/light.json"]);
  await page.evaluate(() => { document.querySelectorAll(".maplibregl-marker, .maplibregl-canvas").forEach(element => element.setAttribute("data-kept", "")); });

  // The device turns dark, and the app with it: the map takes its dark style without being made again.
  await page.emulateMedia({ colorScheme: "dark" });
  await expect(map).toHaveAttribute("data-map-look", "dark");
  await expect.poll(() => styles).toEqual(["/map/light.json", "/map/dark.json"]);
  await expect(map).toHaveAttribute("data-map-state", "ready");
  await expect(page.locator(".maplibregl-marker[data-kept]")).toHaveCount(3);
  await expect(page.locator(".maplibregl-canvas[data-kept]")).toHaveCount(1);
  // The zoom buttons are the app's: rounded, and as tall as a finger needs.
  const zoom = page.locator(".maplibregl-ctrl-zoom-in");
  expect((await zoom.boundingBox())!.height).toBeGreaterThanOrEqual(44);
});

test("map: a friend who moves glides to the new place, for someone who has not asked for less motion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "no-preference" });
  const start = Date.now();
  const state = { friends: three() };
  await signIn(page);
  await mapServer(page, state);
  await page.clock.install({ time: start });
  await page.goto("/me/location");
  await expect(page.locator(".maplibregl-marker")).toHaveCount(3);
  const before = await place(page, "Kha");
  // Every place the marker is drawn at from now on.
  await page.evaluate(() => {
    const seen = new Set<string>();
    (window as unknown as { seen: Set<string> }).seen = seen;
    const element = document.querySelector<HTMLElement>('.maplibregl-marker[aria-label="Vị trí Kha"]')!;
    const look = () => { seen.add(element.style.transform); requestAnimationFrame(look); };
    look();
  });
  state.friends[0] = { ...state.friends[0], latitude: 10.7827, recorded_at: new Date(start + 29_000).toISOString() };
  await page.clock.runFor(31_000);
  await expect.poll(async () => (await place(page, "Kha")).y).toBeLessThan(before.y - 20);
  // Where it was, where it is, and places in between.
  await expect.poll(() => page.evaluate(() => (window as unknown as { seen: Set<string> }).seen.size)).toBeGreaterThan(3);
});

import { expect, test } from "@playwright/test";
import { signIn, user } from "./signedIn";

const friendA = "22222222-2222-4222-8222-222222222222";
const friendB = "33333333-3333-4333-8333-333333333333";
const row = (id: string, name: string) => ({ user_id: id, display_name: name, username: name.toLowerCase(), avatar_url: null, status: "accepted", direction: "incoming", created_at: "2026-01-01T00:00:00Z" });

test("the relationship map only invites a friend to a relationship with the signed-in person", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await signIn(page);
  const invitations: { id: string; other_user_id: string; other_name: string; other_avatar_url: null; direction: "outgoing"; relationship: string; created_at: string }[] = [];
  const sent: { friendId: string; relationship: string }[] = [];
  await page.route("**/rest/v1/**", route => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace(/^.*\/rest\/v1/, "");
    if (path === "/rpc/list_friend_connections") return route.fulfill({ json: [row(friendA, "Kha"), row(friendB, "Lan")] });
    if (path === "/rpc/list_friend_relationship_invites") return route.fulfill({ json: invitations });
    if (path === "/rpc/list_my_friend_relationships") return route.fulfill({ json: [] });
    if (path === "/rpc/send_friend_relationship_invite") {
      const body = request.postDataJSON() as { p_friend_id: string; p_relationship: string };
      sent.push({ friendId: body.p_friend_id, relationship: body.p_relationship });
      invitations.push({ id: "relationship-new", other_user_id: body.p_friend_id, other_name: "Kha", other_avatar_url: null, direction: "outgoing", relationship: body.p_relationship, created_at: new Date().toISOString() });
      return route.fulfill({ json: "relationship-new" });
    }
    return route.fulfill({ json: [] });
  });

  await page.goto("/me/relationships");
  await expect(page.getByRole("heading", { name: "Quan hệ", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Gửi lời mời quan hệ cho Kha" }).click();
  const invitation = page.getByRole("dialog", { name: "Đề nghị quan hệ" });
  await invitation.getByLabel("Hoặc tự đặt tên").fill("Mập");
  await invitation.getByRole("button", { name: "Gửi lời mời quan hệ" }).click();
  await expect(invitation).toBeHidden();
  expect(sent).toEqual([{ friendId: friendA, relationship: "Mập" }]);
  await expect(page.getByRole("heading", { name: "Lời mời bạn đã gửi · 1" })).toBeVisible();
  for (const width of [320, 360, 390, 768, 1280]) {
    await page.setViewportSize({ width, height: width < 400 ? 740 : 900 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${width}px relationship screen should fit`).toBe(true);
  }
});

test("a friend's profile sends a custom relationship invitation", async ({ page }) => {
  await signIn(page);
  const sent: { friendId: string; relationship: string }[] = [];
  await page.route("**/rest/v1/**", route => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace(/^.*\/rest\/v1/, "");
    if (path === "/rpc/list_friend_connections") return route.fulfill({ json: [row(friendA, "Kha")] });
    if (path === "/rpc/get_profile_card") return route.fulfill({ json: [{ user_id: friendA, display_name: "Kha", username: "kha", avatar_url: null, bio: "", birthday: null }] });
    if (path === "/rpc/send_friend_relationship_invite") {
      const body = request.postDataJSON() as { p_friend_id: string; p_relationship: string };
      sent.push({ friendId: body.p_friend_id, relationship: body.p_relationship });
      return route.fulfill({ json: "44444444-4444-4444-8444-444444444444" });
    }
    return route.fulfill({ json: [] });
  });

  await page.goto("/me/friends");
  await page.getByRole("button", { name: "Xem hồ sơ của Kha" }).click();
  await page.getByRole("dialog", { name: "Kha" }).getByRole("button", { name: "Đề nghị quan hệ" }).click();
  const invitation = page.getByRole("dialog", { name: "Đề nghị quan hệ" });
  await invitation.getByLabel("Hoặc tự đặt tên").fill("Mập");
  await invitation.getByRole("button", { name: "Gửi lời mời quan hệ" }).click();
  await expect(invitation).toBeHidden();
  expect(sent).toEqual([{ friendId: friendA, relationship: "Mập" }]);
});

test("accepting a relationship invitation adds it to the shared relationship list", async ({ page }) => {
  await signIn(page);
  const inviteId = "66666666-6666-4666-8666-666666666666";
  const inbox = [{ id: inviteId, other_user_id: friendA, other_name: "Kha", other_avatar_url: null, direction: "incoming", relationship: "Tình bạn", created_at: "2026-10-20T10:00:00Z" }];
  const shared: { friend_id: string; friend_name: string; friend_avatar_url: null; relationship: string; created_at: string; current_streak: number; last_message_at: string | null }[] = [];
  await page.route("**/rest/v1/**", route => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace(/^.*\/rest\/v1/, "");
    if (path === "/rpc/list_friend_connections") return route.fulfill({ json: [row(friendA, "Kha")] });
    if (path === "/rpc/list_friend_relationship_invites") return route.fulfill({ json: inbox });
    if (path === "/rpc/list_my_friend_relationships") return route.fulfill({ json: shared });
    if (path === "/rpc/respond_friend_relationship_invite") {
      const body = request.postDataJSON() as { p_invite_id: string; p_accept: boolean };
      if (body.p_accept && body.p_invite_id === inviteId) {
        inbox.splice(0);
        shared.push({ friend_id: friendA, friend_name: "Kha", friend_avatar_url: null, relationship: "Tình bạn", created_at: new Date().toISOString(), current_streak: 3, last_message_at: new Date().toISOString() });
      }
      return route.fulfill({ json: null });
    }
    return route.fulfill({ json: [] });
  });

  await page.goto("/me/relationships");
  await expect(page.getByText("Mời bạn: Tình bạn")).toBeVisible();
  await page.getByRole("button", { name: "Chấp nhận" }).click();
  await expect(page.getByText("Đã chấp nhận lời mời quan hệ.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Quan hệ đã xác nhận · 1" })).toBeVisible();
  const friend = page.getByRole("listitem").filter({ hasText: "Kha" });
  await expect(friend).toContainText("Tình bạn");
  await expect(friend).toContainText("Chuỗi 3 ngày");
  await expect(friend.getByRole("link", { name: "Nhắn tin" })).toHaveAttribute("href", "/chat/with/" + friendA);
});

test("a direct chat can propose a relationship and posts a link to its invitation", async ({ page }) => {
  await signIn(page);
  const sent: { friendId: string; relationship: string }[] = [];
  const messages: Record<string, unknown>[] = [];
  await page.route("**/rest/v1/**", route => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace(/^.*\/rest\/v1/, "");
    if (path === "/rpc/open_direct_conversation") return route.fulfill({ json: "relationship-chat" });
    if (path === "/rpc/list_friend_connections") return route.fulfill({ json: [row(friendA, "Kha")] });
    if (path === "/rpc/list_conversations") return route.fulfill({ json: [{ id: "relationship-chat", kind: "direct", title: "Kha", other_user_id: friendA, last_message_at: null, last_message_body: null, unread_count: 0, closed: false, group_id: null, owner_id: null, muted: false, muted_until: null }] });
    if (path === "/rpc/send_friend_relationship_invite") {
      const body = request.postDataJSON() as { p_friend_id: string; p_relationship: string };
      sent.push({ friendId: body.p_friend_id, relationship: body.p_relationship });
      return route.fulfill({ json: "55555555-5555-4555-8555-555555555555" });
    }
    if (path === "/rpc/post_message") { messages.push(request.postDataJSON() as Record<string, unknown>); return route.fulfill({ json: null }); }
    return route.fulfill({ json: [] });
  });

  await page.goto(`/chat/with/${friendA}`);
  await page.getByRole("button", { name: "Đề nghị quan hệ với Kha" }).click();
  const invitation = page.getByRole("dialog", { name: "Đề nghị quan hệ" });
  await invitation.getByRole("button", { name: "Tình yêu", exact: true }).click();
  await invitation.getByRole("button", { name: "Gửi lời mời quan hệ" }).click();
  await expect(invitation).toBeHidden();
  await expect.poll(() => messages.length).toBe(1);
  expect(sent).toEqual([{ friendId: friendA, relationship: "Tình yêu" }]);
  expect(messages[0]).toMatchObject({
    p_conversation_id: "relationship-chat",
    p_body: "Mình gửi bạn lời mời quan hệ: Tình yêu.",
    p_ref_path: "/me/relationships",
    p_ref_title: "Lời mời quan hệ · Tình yêu",
  });
});

test("an accepted relationship's message streak appears in its direct chat", async ({ page }) => {
  await signIn(page);
  await page.route("**/rest/v1/**", route => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace(/^.*\/rest\/v1/, "");
    if (path === "/rpc/open_direct_conversation") return route.fulfill({ json: "streak-chat" });
    if (path === "/rpc/list_friend_connections") return route.fulfill({ json: [row(friendA, "Kha")] });
    if (path === "/rpc/list_conversations") return route.fulfill({ json: [{ id: "streak-chat", kind: "direct", title: "Kha", other_user_id: friendA, last_message_at: null, last_message_body: null, unread_count: 0, closed: false, group_id: null, owner_id: null, muted: false, muted_until: null }] });
    if (path === "/rpc/list_my_friend_relationships") return route.fulfill({ json: [{
      friend_id: friendA, friend_name: "Kha", friend_avatar_url: null, relationship: "Tình yêu",
      created_at: "2026-10-20T10:00:00Z", current_streak: 2, last_message_at: new Date().toISOString(),
    }] });
    return route.fulfill({ json: [] });
  });

  await page.goto("/chat/with/" + friendA);
  await expect(page.getByRole("link", { name: "Tình yêu · chuỗi 2 ngày" })).toHaveAttribute("href", "/me/relationships");
  await expect(page.getByRole("button", { name: "Đề nghị quan hệ với Kha" })).toHaveCount(0);
});

test("feedback is delivered to tk1ll3r, and the recipient can read it in the private inbox", async ({ page }) => {
  await signIn(page);
  const state = { messages: [{ id: "feedback-1", sender_id: user.id, sender_name: "Vy", sender_username: "vy", sender_avatar_url: null, message: "Thêm album ảnh theo người nhé", created_at: "2026-10-20T10:00:00Z", read_at: null }], sent: [] as string[], recipient: false };
  await page.route("**/rest/v1/**", route => {
    const request = route.request();
    const path = new URL(request.url()).pathname.replace(/^.*\/rest\/v1/, "");
    if (path === "/rpc/is_feedback_recipient") return route.fulfill({ json: state.recipient });
    if (path === "/rpc/submit_admin_feedback") {
      state.sent.push(String((request.postDataJSON() as { p_message: string }).p_message));
      return route.fulfill({ json: "feedback-new" });
    }
    if (path === "/rpc/list_admin_feedback") return route.fulfill({ json: state.messages });
    if (path === "/rpc/mark_admin_feedback_read") {
      state.messages = state.messages.map(item => ({ ...item, read_at: new Date().toISOString() }));
      return route.fulfill({ json: null });
    }
    return route.fulfill({ json: [] });
  });

  await page.goto("/feedback");
  await expect(page.getByText("Góp ý sẽ được gửi riêng đến tài khoản @tk1ll3r. Chỉ admin mới đọc được nội dung.")).toBeVisible();
  await page.getByLabel("Nội dung góp ý").fill("Album ảnh cần lọc được từng người");
  await page.getByRole("button", { name: "Gửi đến tk1ll3r" }).click();
  await expect(page.getByText("Đã gửi góp ý đến admin tk1ll3r.")).toBeVisible();
  expect(state.sent).toEqual(["Album ảnh cần lọc được từng người"]);

  state.recipient = true;
  await page.reload();
  await expect(page.getByRole("heading", { name: "Hộp thư góp ý" })).toBeVisible();
  await expect(page.getByText("Thêm album ảnh theo người nhé")).toBeVisible();
  await page.getByRole("button", { name: "Đánh dấu góp ý của Vy đã đọc" }).click();
  await expect(page.getByRole("button", { name: "Đánh dấu góp ý của Vy đã đọc" })).toHaveCount(0);
});

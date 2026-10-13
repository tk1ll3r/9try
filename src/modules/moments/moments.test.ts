import type { SupabaseClient } from "@supabase/supabase-js";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ago, byPerson, frameOrder, homeWarmPaths, live, momentSignals, openingMoment, photosToWarm, signOf, viewerWarmPaths, type Moment } from "./domain/Moment";
import { SupabaseMomentRepository } from "./infrastructure/SupabaseMomentRepository";

const now = new Date("2026-10-09T10:00:00Z");
const at = (minutesAgo: number) => new Date(now.getTime() - minutesAgo * 60_000).toISOString();
const photo = (id: string, ownerId: string, minutesAgo: number, fields: Partial<Moment> = {}): Moment => ({
  id, ownerId, ownerName: ownerId, ownerAvatarUrl: null, path: `${ownerId}/${id}.jpg`, mode: null, caption: "", width: 1080, height: 1350,
  createdAt: at(minutesAgo), expiresAt: at(minutesAgo - 24 * 60), audience: "friends", mine: ownerId === "me", seen: ownerId === "me", myReaction: null, views: 0, reactions: {}, ...fields,
});

describe("photos of the day", () => {
  const all = [
    photo("k-old", "kha", 300, { seen: true }), photo("k-new", "kha", 20), photo("l-1", "lan", 90, { seen: true }),
    photo("mine", "me", 10), photo("over", "thu", 24 * 60 + 5),
  ];
  it("stop being shown at the minute they end, whatever the server still returned", () => {
    expect(live(all, now.getTime()).map(moment => moment.id)).toEqual(["k-old", "k-new", "l-1", "mine"]);
  });
  it("are ordered in the frame with what was not looked at first, then the newest", () => {
    expect(frameOrder(all, now.getTime()).map(moment => moment.id)).toEqual(["k-new", "mine", "l-1", "k-old"]);
  });
  it("are grouped by person in the order they were taken: people with something new first, one's own last", () => {
    const people = byPerson(all, now.getTime());
    expect(people.map(person => [person.ownerId, person.unseen, person.moments.map(moment => moment.id)])).toEqual([
      ["kha", 1, ["k-old", "k-new"]], ["lan", 0, ["l-1"]], ["me", 0, ["mine"]],
    ]);
  });
  it("opens the exact requested photo, or selects the first unseen photo for a person link", () => {
    const people = byPerson(all, now.getTime());
    expect(openingMoment(people[0]).id).toBe("k-new");
    expect(openingMoment(people[1]).id).toBe("l-1");
  });
  it("move a friend up on Mode: in full within the hour, less for a new one from earlier, least once looked at", () => {
    const signals = momentSignals([...all, photo("t-1", "thu", 200)], now);
    expect(signals).toEqual([
      { userId: "kha", kind: "moment", strength: 1, label: "Vừa đăng ảnh", to: "/moments/kha/k-new" },
      { userId: "thu", kind: "moment", strength: 0.7, label: "Có ảnh mới", to: "/moments/thu/t-1" },
      { userId: "lan", kind: "moment", strength: 0.4, label: "Có ảnh hôm nay", to: "/moments/lan/l-1" },
    ]);
  });
  it("fetches the photo on screen, one behind it, and two ahead", () => {
    expect(photosToWarm(["a", "b", "c", "d", "e"], 0)).toEqual(["a", "b", "c"]);
    expect(photosToWarm(["a", "b", "c", "d", "e"], 2)).toEqual(["b", "c", "d", "e"]);
    expect(photosToWarm(["a", "b", "c", "d", "e"], 4)).toEqual(["d", "e"]);
    expect(photosToWarm([], 0)).toEqual([]);
  });
  it("on the home screen, starts the open photo of the next people after the run on screen, and stops at eight", () => {
    const frame = ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j"];
    expect(homeWarmPaths(frame, 0, ["a", "z", "y"])).toEqual(["a", "b", "c", "z", "y"]);
    expect(homeWarmPaths(frame, 0, frame)).toEqual(frame.slice(0, 8));
    expect(homeWarmPaths(["a"], 3, ["b"])).toEqual(["a", "b"]);
  });
  it("in a person's reel, keeps the next person's first photo ahead of the rest of this reel", () => {
    expect(viewerWarmPaths(["a", "b", "c", "d"], 1, "n")).toEqual(["a", "b", "c", "d", "n"]);
    expect(viewerWarmPaths(["a", "b", "c", "d", "e", "f", "g", "h", "i"], 0, "n")).toEqual(["a", "b", "c", "n", "d", "e", "f", "g"]);
    expect(viewerWarmPaths([], 0, "n")).toEqual(["n"]);
  });
  it("say how long ago they were taken, and show a reaction by its sign", () => {
    expect([ago(at(0), now.getTime()), ago(at(12), now.getTime()), ago(at(185), now.getTime())]).toEqual(["vừa xong", "12 phút trước", "3 giờ trước"]);
    expect([signOf("fire"), signOf("unknown"), signOf(null)]).toEqual(["🔥", "", ""]);
  });
});

describe("the photo repository", () => {
  const rpc = vi.fn();
  const bucket = { upload: vi.fn(), remove: vi.fn(), createSignedUrls: vi.fn() };
  const from = vi.fn(() => bucket);
  const repository = () => new SupabaseMomentRepository({ rpc, storage: { from } } as unknown as SupabaseClient, "me");
  const draft = { blob: new Blob(["jpeg"]), width: 1080, height: 810, mode: "coffee", caption: "Sáng nay", viewerIds: null as string[] | null, activateMode: false, modeMinutes: 120 };

  beforeEach(() => {
    rpc.mockReset().mockResolvedValue({ data: null, error: null });
    bucket.upload.mockReset().mockResolvedValue({ error: null });
    bucket.remove.mockReset().mockResolvedValue({ error: null });
    bucket.createSignedUrls.mockReset().mockImplementation(async (paths: string[]) => ({ data: paths.map(path => ({ path, signedUrl: `https://files.example/${path}?token=t`, error: null })), error: null }));
  });

  it("puts the file under the person's own id, then posts the photo under the same id", async () => {
    await repository().post(draft);
    const [path, blob, options] = bucket.upload.mock.calls[0];
    expect(from).toHaveBeenCalledWith("moments");
    expect(path).toMatch(/^me\/[0-9a-f-]{36}\.jpg$/);
    expect(blob).toBe(draft.blob);
    expect(options).toMatchObject({ contentType: "image/jpeg" });
    expect(rpc).toHaveBeenCalledWith("post_moment", { p_id: path.slice(3, -4), p_width: 1080, p_height: 810, p_mode: "coffee", p_caption: "Sáng nay", p_viewer_ids: null, p_activate_mode: false, p_mode_minutes: 120 });
  });
  it("names the chosen friends when the photo is not for everyone, and never widens a list to everyone", async () => {
    await repository().post({ ...draft, viewerIds: ["kha", "lan"] });
    expect(rpc.mock.calls[0][1]).toMatchObject({ p_viewer_ids: ["kha", "lan"] });
    await repository().post({ ...draft, viewerIds: [] });
    expect(rpc.mock.calls[1][1]).toMatchObject({ p_viewer_ids: [] });
  });
  it("posts nothing when the file was refused, and takes the file back when the photo was", async () => {
    bucket.upload.mockResolvedValueOnce({ error: new Error("too large") });
    await expect(repository().post(draft)).rejects.toThrow("too large");
    expect(rpc).not.toHaveBeenCalled();

    rpc.mockResolvedValueOnce({ data: null, error: { message: "too many photos", code: "P0001" } });
    await expect(repository().post(draft)).rejects.toMatchObject({ message: "too many photos" });
    expect(bucket.remove).toHaveBeenCalledWith([bucket.upload.mock.calls[1][0]]);
  });
  it("keeps the file when no answer came: the photo may be posted all the same", async () => {
    rpc.mockResolvedValueOnce({ data: null, error: { message: "TypeError: Failed to fetch", code: "" } });
    await expect(repository().post(draft)).rejects.toMatchObject({ message: "TypeError: Failed to fetch" });
    expect(bucket.remove).not.toHaveBeenCalled();
  });
  it("removes the file whose name the server gives back when a photo is deleted", async () => {
    rpc.mockResolvedValueOnce({ data: "me/p1.jpg", error: null });
    await repository().remove("p1");
    expect(rpc).toHaveBeenCalledWith("delete_moment", { p_id: "p1" });
    expect(bucket.remove).toHaveBeenCalledWith(["me/p1.jpg"]);
  });
  it("signs the addresses of the photos once, and again only for a photo it has not signed", async () => {
    const photos = repository();
    expect([...await photos.addresses(["kha/a.jpg", "kha/b.jpg"])]).toEqual([["kha/a.jpg", "https://files.example/kha/a.jpg?token=t"], ["kha/b.jpg", "https://files.example/kha/b.jpg?token=t"]]);
    await photos.addresses(["kha/a.jpg", "kha/b.jpg", "lan/c.jpg"]);
    expect(bucket.createSignedUrls.mock.calls.map(call => call[0])).toEqual([["kha/a.jpg", "kha/b.jpg"], ["lan/c.jpg"]]);
    expect(bucket.createSignedUrls.mock.calls[0][1]).toBe(3600);
  });
  it("reads a photo as the screen needs it: whose it is, whether it was looked at, and the owner's counts", async () => {
    rpc.mockResolvedValueOnce({ data: [
      { id: "p1", owner_id: "me", owner_name: "Vy", owner_avatar_url: null, path: "me/p1.jpg", mode: "coffee", caption: "Sáng", width: 1080, height: 810, created_at: at(5), expires_at: at(-1435), audience: "selected", seen: true, my_reaction: null, views: 2, reactions: { fire: 1 } },
      { id: "p2", owner_id: "kha", owner_name: "Kha", owner_avatar_url: null, path: "kha/p2.jpg", mode: null, caption: "", width: 800, height: 1000, created_at: at(9), expires_at: at(-1431), audience: "friends", seen: false, my_reaction: "heart", views: null, reactions: null },
    ], error: null });
    expect(await repository().list()).toMatchObject([
      { id: "p1", mine: true, seen: true, views: 2, reactions: { fire: 1 }, audience: "selected", mode: "coffee" },
      { id: "p2", mine: false, seen: false, myReaction: "heart", views: 0, reactions: {}, ownerName: "Kha" },
    ]);
  });
});

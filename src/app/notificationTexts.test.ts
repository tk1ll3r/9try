import { describe, expect, it } from "vitest";
import { activityNames, fixedTexts, localize, pushText, safeUrl } from "../../supabase/functions/_shared/notificationTexts";
import { en } from "../kernel/locales/en";
import { choices } from "../modules/presence/presentation/modes";

// The table of what the database writes into notifications is shared by the inbox and the push worker.
describe("notification texts", () => {
  it("names every activity of the app the way the app names it, in both languages", () => {
    expect(Object.keys(activityNames).sort()).toEqual(choices.map(choice => choice.id).sort());
    for (const choice of choices) expect(activityNames[choice.id]).toEqual([choice.label, en[choice.label]]);
  });
  it("says a text of the app the same way the app's own dictionary does", () => {
    const shared = Object.entries(fixedTexts).filter(([text]) => text in en);
    expect(shared.length).toBeGreaterThan(0);
    for (const [text, english] of shared) expect(english).toBe(en[text]);
  });
  it("leaves Vietnamese as written, and turns the key of an activity into its name", () => {
    expect(localize("Lời mời kết bạn", "vi")).toBe("Lời mời kết bạn");
    expect(localize("mode:coffee", "vi")).toBe("Cà phê");
    expect(localize("mode:coffee", "en")).toBe("Coffee");
    expect(localize("mode:something_newer", "en")).toBe("Doing something else");
  });
  it("puts names and times into the English sentence, and leaves what a person wrote alone", () => {
    expect(localize("Tin nhắn mới · Nhóm đồ án", "en")).toBe("New message · Nhóm đồ án");
    expect(localize("Kha vừa bật mode", "en")).toBe("Kha turned a mode on");
    expect(localize("Sắp diễn ra: Ăn tối", "en")).toBe("Coming up: Ăn tối");
    expect(localize("Bắt đầu lúc 18:30", "en")).toBe("Starts at 18:30");
    expect(localize("An $1 & $& muốn xem lịch của bạn", "en")).toBe("An $1 & $& wants to see your schedule");
    expect(localize("Ăn tối cuối tuần", "en")).toBe("Ăn tối cuối tuần");
  });
  it("hides who and what on the lock screen when the person asked for that", () => {
    const item = { title: "Tin nhắn mới · Kha", body: "", private: true };
    expect(pushText(item, "en")).toEqual({ title: "Gnouht Together", body: "You have a new notification." });
    expect(pushText({ ...item, private: false }, "en")).toEqual({ title: "New message · Kha", body: "" });
    expect(pushText({ title: "Kha vừa bật mode", body: "mode:free", private: false }, "vi")).toEqual({ title: "Kha vừa bật mode", body: "Đang rảnh" });
  });
  it("lets a push lead only to a plain path inside the app", () => {
    for (const url of ["/", "/chat/abc-123", "/meetups/22222222-2222-4222-8222-222222222222", "/calendar/shared/x", "/moments/22222222-2222-4222-8222-222222222222/33333333-2222-4222-8222-222222222222"]) expect(safeUrl(url)).toBe(url);
    for (const url of ["https://evil.example", "//evil.example", "/a//b", "/chat?next=//evil.example", "javascript:alert(1)", "/a\\b", "", null, 5, undefined]) expect(safeUrl(url)).toBe("/notifications");
  });
});

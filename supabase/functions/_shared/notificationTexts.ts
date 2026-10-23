// What the database writes into a notification, and how to say it in each language.
//
// The SQL functions under supabase/migrations write notifications in Vietnamese. This file is the
// one place that knows their English. The web app shows the inbox through it and the push worker
// writes each push through it, in the language of the device it goes to. It has no imports, so
// both can load it. A text that is not listed here is something a person wrote (the name of a
// meetup, of an event) and is shown as it is.

export type Language = "vi" | "en";

/** The texts that are written the same way every time. */
export const fixedTexts: Readonly<Record<string, string>> = {
  "Lời mời kết bạn": "Friend requests",
  "Có người muốn kết nối với bạn.": "Someone wants to connect with you.",
  "Đã kết bạn": "You are friends now",
  "Hai bạn đã có thể lên kế hoạch cùng nhau.": "You two can plan together now.",
  "Lời mời đã được chấp nhận": "Your request was accepted",
  "Hai bạn đã kết nối.": "You two are connected.",
  "Có bạn mới qua liên kết": "A new friend through your link",
  "Một người vừa dùng liên kết kết bạn của bạn.": "Someone has just used your friend link.",
  "Lời mời hoạt động": "Meetup invites",
  "Hoạt động có thay đổi": "A meetup has changed",
  "Đã chốt thời gian": "The time is confirmed",
  "Hoạt động đã hủy": "A meetup was cancelled",
  "Cập nhật tham gia": "Answers to invites",
  "Mở bản đồ nếu bạn muốn chia sẻ vị trí.": "Open the map if you want to share your location.",
  "Nhắc việc": "Reminder",
  "Bạn có một việc sắp tới.": "You have something coming up.",
  "Bạn chọn chia sẻ lúc bận, cả tên sự kiện, hoặc từ chối.": "You choose to share busy times, event names too, or to decline.",
  "Mở để xem lịch trong những ngày được chia sẻ.": "Open to see the schedule on the shared days.",
  "Bạn có thể hỏi lại sau một tuần.": "You can ask again in a week.",
  "Thông báo thử": "Test notification",
  "Thiết bị này nhận được thông báo đẩy của Gnouht.": "This device receives push notifications from Gnouht.",
  "Bạn có thông báo mới.": "You have a new notification.",
  "Góp ý mới": "New feedback",
  // The one line the database writes for a message without words of its own, in the list of conversations and in a quoted reply.
  "Tin nhắn đã thu hồi": "This message was unsent",
  "Đã gửi ảnh": "Sent a photo",
  "Đã chia sẻ một mục": "Shared something",
};

/** The texts that carry a name, a title or a time. `$1` is that part. */
const patterned: readonly [vietnamese: RegExp, english: string][] = [
  [/^Tin nhắn mới · (.+)$/s, "New message · $1"],
  [/^Ảnh mới · (.+)$/s, "New photo · $1"],
  [/^(.+) mời bạn vào sổ chi tiêu$/s, "$1 invited you to an expense book"],
  [/^(.+) đã vào sổ chi tiêu$/s, "$1 joined the expense book"],
  [/^(.+) mở sổ chi tiêu cho nhóm$/s, "$1 opened an expense book for the group"],
  [/^(.+) ghi một khoản trả lại$/s, "$1 recorded a repayment"],
  [/^(.+) thả cảm xúc vào ảnh của bạn$/s, "$1 reacted to your photo"],
  [/^(.+) muốn biết bạn đang ở đâu$/s, "$1 wants to know where you are"],
  [/^Bạn đang gần (.+)$/s, "You're near $1"],
  [/^Cả hai đang ở trong phạm vi khoảng (\d+) m\.$/s, "You're both within about $1 m."],
  [/^(.+) muốn xem lịch của bạn$/s, "$1 wants to see your schedule"],
  [/^(.+) đã chia sẻ lịch với bạn$/s, "$1 shared their schedule with you"],
  [/^(.+) chưa chia sẻ lịch với bạn$/s, "$1 has not shared their schedule with you"],
  [/^(.+) vừa bật mode$/s, "$1 turned a mode on"],
  [/^(.+) mở thảo luận$/s, "$1 opened a discussion"],
  [/^(.+) chia sẻ một sự kiện với bạn$/s, "$1 shared an event with you"],
  [/^(.+) đã đổi một sự kiện$/s, "$1 changed an event"],
  [/^Sắp diễn ra: (.+)$/s, "Coming up: $1"],
  [/^Bắt đầu lúc (\d{2}:\d{2})$/, "Starts at $1"],
];

/**
 * The activities by their key, in both languages. The database stores the key only, and writes
 * "mode:<key>" where a notification names an activity. The app's own list is in
 * src/modules/presence/presentation/modes.ts; a test keeps the two the same.
 */
export const activityNames: Readonly<Record<string, readonly [vietnamese: string, english: string]>> = {
  free: ["Đang rảnh", "Free now"],
  busy: ["Đang bận", "Busy"],
  studying: ["Học bài", "Studying"],
  school: ["Đi học", "In class"],
  working: ["Làm việc", "Working"],
  coffee: ["Cà phê", "Coffee"],
  eating: ["Ăn uống", "Eating"],
  drinks: ["Nhậu", "Drinks"],
  hangout: ["Đi chơi", "Out and about"],
  shopping: ["Mua sắm", "Shopping"],
  gaming: ["Chơi game", "Gaming"],
  billiards: ["Chơi Bi a", "Billiards"],
  movie: ["Xem phim", "Watching a film"],
  music: ["Nghe nhạc", "Listening to music"],
  reading: ["Đọc sách", "Reading"],
  workout: ["Tập thể dục", "Working out"],
  sport: ["Chơi thể thao", "Playing sport"],
  moving: ["Đang di chuyển", "On the way"],
  sleeping: ["Ngủ", "Sleeping"],
};
const otherActivity = ["Đang làm việc khác", "Doing something else"] as const;

/** A notification's title or text in `language`. */
export function localize(text: string, language: Language): string {
  const mode = /^mode:([a-z0-9_]+)$/.exec(text);
  if (mode) return (activityNames[mode[1]] ?? otherActivity)[language === "en" ? 1 : 0];
  if (language === "vi") return text;
  if (text in fixedTexts) return fixedTexts[text];
  for (const [vietnamese, english] of patterned) {
    const found = vietnamese.exec(text);
    // A function, so that a "$" in someone's name is not read as a place to fill.
    if (found) return english.replace("$1", () => found[1]);
  }
  return text;
}

export interface PushText {
  title: string;
  body: string;
}

/**
 * What a push says on a device. With a private preview it says only that something arrived: the
 * lock screen then shows no name and no message.
 */
export function pushText(item: { title: string; body: string; private: boolean }, language: Language): PushText {
  if (item.private) return { title: "Gnouht Together", body: localize("Bạn có thông báo mới.", language) };
  return { title: localize(item.title, language), body: localize(item.body, language) };
}

/**
 * Where a push may lead: a plain path inside the app, or the inbox. A push is text from a server; a
 * link in it is followed only when it cannot leave the app. The service worker has the same rule.
 */
export function safeUrl(url: unknown): string {
  return typeof url === "string" && /^\/[A-Za-z0-9_\-/]*$/.test(url) && !url.includes("//") ? url : "/notifications";
}

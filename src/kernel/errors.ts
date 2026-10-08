import { t } from "./i18n";
// Short codes raised by the SQL functions, and what to show for them.
const known: [code: string, text: string][] = [
  ["user not found", t("Không tìm thấy username này.")],
  ["friendship already exists", t("Hai bạn đã có một trạng thái kết nối.")],
  ["request unavailable", t("Không gửi được lời mời tới người này.")],
  ["invite unavailable", t("Chỉ mời được bạn bè hoặc thành viên của nhóm gắn với hoạt động.")],
  ["no valid recipients", t("Chỉ chia sẻ được với bạn bè đã kết nối.")],
  ["capacity reached", t("Hoạt động vừa đủ số người tham gia.")],
  ["transfer ownership of groups", t("Bạn đang là chủ nhóm có thành viên khác. Hãy chuyển quyền chủ nhóm trước khi xóa tài khoản.")],
  ["profiles_username", t("Username này đã có người dùng. Hãy chọn username khác.")],
  ["transfer ownership first", t("Hãy chuyển quyền chủ nhóm cho người khác trước.")],
  ["availability not shared", t("Người này chưa chia sẻ trạng thái bận/rảnh với bạn.")],
  ["own invite", t("Đây là liên kết của chính bạn. Hãy gửi nó cho người bạn muốn kết bạn.")],
  ["invite not found", t("Liên kết không còn hiệu lực. Hãy xin một liên kết mới.")],
  ["link unavailable", t("Liên kết này không dùng được.")],
  ["not a participant", t("Bạn không ở trong cuộc trò chuyện này.")],
  ["routine not found", t("Không tìm thấy thói quen này.")],
  ["not friends", t("Chỉ ghim được người đã là bạn của bạn.")],
  ["invalid activity mode or duration", t("Hoạt động hoặc thời hạn này không dùng được.")],
  // What the Supabase client says when a server function cannot be called, or refuses without a reason.
  // A function that is not deployed looks like a lost connection to a browser: its preflight request fails.
  ["Failed to send a request to the Edge Function", t("Chưa gọi được máy chủ cho việc này. Kiểm tra mạng rồi thử lại. Nếu vẫn không được, tính năng này chưa được bật trên máy chủ.")],
  ["Edge Function returned a non-2xx status code", t("Máy chủ chưa làm được việc này. Hãy thử lại sau.")],
];

// The database answers with these codes when a function, table or column of a newer migration is missing.
const serverTooOld = ["PGRST202", "PGRST204", "PGRST205", "42883", "42P01", "42703"];

/** Text to show for a failed operation. Supabase errors can be plain objects with a `message`. */
export function errorMessage(error: unknown, fallback: string): string {
  if (error && typeof error === "object" && "code" in error && serverTooOld.includes(String(error.code))) {
    return t("Tính năng này chưa dùng được vì máy chủ chưa được cập nhật.");
  }
  const text = error instanceof Error ? error.message
    : error && typeof error === "object" && "message" in error && typeof error.message === "string" ? error.message
    : "";
  return known.find(([code]) => text.includes(code))?.[1] ?? (text || fallback);
}

/** A rule of the app was broken. `message` is ready to show; `code` is for code that reacts to it. */
export class DomainError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "DomainError";
  }
}

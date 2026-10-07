// Short codes raised by the SQL functions, and what to show for them.
const known: [code: string, text: string][] = [
  ["user not found", "Không tìm thấy username này."],
  ["friendship already exists", "Hai bạn đã có một trạng thái kết nối."],
  ["request unavailable", "Không gửi được lời mời tới người này."],
  ["invite unavailable", "Chỉ mời được bạn bè hoặc thành viên của nhóm gắn với hoạt động."],
  ["no valid recipients", "Chỉ chia sẻ được với bạn bè đã kết nối."],
  ["capacity reached", "Hoạt động vừa đủ số người tham gia."],
  ["transfer ownership of groups", "Bạn đang là chủ nhóm có thành viên khác. Hãy chuyển quyền chủ nhóm trước khi xóa tài khoản."],
  ["profiles_username", "Username này đã có người dùng. Hãy chọn username khác."],
  ["transfer ownership first", "Hãy chuyển quyền chủ nhóm cho người khác trước."],
  ["availability not shared", "Người này chưa chia sẻ trạng thái bận/rảnh với bạn."],
  ["own invite", "Đây là liên kết của chính bạn. Hãy gửi nó cho người bạn muốn kết bạn."],
  ["invite not found", "Liên kết không còn hiệu lực. Hãy xin một liên kết mới."],
  ["link unavailable", "Liên kết này không dùng được."],
  ["not a participant", "Bạn không ở trong cuộc trò chuyện này."],
  ["routine not found", "Không tìm thấy thói quen này."],
];

/** Text to show for a failed operation. Supabase errors can be plain objects with a `message`. */
export function errorMessage(error: unknown, fallback: string): string {
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

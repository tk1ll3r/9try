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
  ["conversation closed", t("Cuộc trò chuyện này đã đóng, không gửi thêm được.")],
  ["room unavailable", t("Phòng này không mở được cho bạn.")],
  ["removed from room", t("Người mở phòng đã mời bạn ra khỏi phòng này.")],
  ["routine not found", t("Không tìm thấy thói quen này.")],
  ["not friends", t("Chỉ ghim được người đã là bạn của bạn.")],
  ["invalid activity mode or duration", t("Hoạt động hoặc thời hạn này không dùng được.")],
  ["custom mode name already exists", t("Tên mode này đã được bạn dùng.")],
  ["invalid custom mode", t("Thông tin mode chưa hợp lệ. Hãy chọn tên, biểu tượng và màu khác.")],
  ["request already sent", t("Bạn đã hỏi rồi. Hãy chờ người này trả lời.")],
  ["request too soon", t("Người này vừa từ chối. Bạn có thể hỏi lại sau một tuần.")],
  ["too many requests", t("Bạn đã hỏi quá nhiều lần hôm nay. Hãy thử lại vào ngày mai.")],
  ["request not found", t("Yêu cầu này không còn chờ trả lời.")],
  ["invalid sharing choice", t("Lựa chọn chia sẻ này không dùng được. Hãy kiểm tra khoảng ngày.")],
  ["schedule not shared", t("Người này chưa cho bạn xem lịch.")],
  ["feature not granted", t("Tài khoản này không có tính năng này.")],
  ["split does not add up", t("Các phần cộng lại phải bằng số tiền đã chi.")],
  ["invalid split", t("Cách chia này không dùng được.")],
  ["invalid amount", t("Số tiền này không dùng được.")],
  ["expense changed elsewhere", t("Khoản chi này vừa được sửa ở nơi khác. Hãy mở lại rồi sửa.")],
  ["expense not found", t("Không tìm thấy khoản này trong sổ.")],
  ["not in this expense book", t("Mục này không thuộc sổ của bạn.")],
  ["expense book not found", t("Không mở được sổ này. Có thể bạn không còn ở trong sổ.")],
  ["book is read only", t("Bạn chỉ xem được sổ này, không nhập hay sửa được.")],
  ["not your entry", t("Khoản này do người khác ghi. Chỉ người ghi và chủ sổ sửa hay xóa được.")],
  ["invalid book name", t("Hãy đặt tên cho sổ.")],
  ["not in this group", t("Bạn không ở trong nhóm này.")],
  ["group already has a book", t("Nhóm này đã có một sổ chi tiêu.")],
  ["book invite unavailable", t("Chỉ mời được người đã là bạn của bạn vào sổ.")],
  ["already in this book", t("Người này đã ở trong sổ.")],
  ["invitation not found", t("Lời mời này không còn hiệu lực.")],
  ["message not found", t("Tin nhắn này không còn, hoặc không phải của bạn để thay đổi.")],
  ["too late to edit", t("Tin nhắn chỉ sửa được trong 15 phút sau khi gửi.")],
  ["invalid message", t("Tin nhắn trống hoặc quá dài.")],
  ["invalid attachment", t("Ảnh đính kèm chưa được tải lên đúng cách. Hãy thử gửi lại.")],
  ["invalid card", t("Mục đính kèm này không gửi được.")],
  ["invalid reaction", t("Cảm xúc này không dùng được.")],
  ["photo not uploaded", t("Ảnh chưa được tải lên. Hãy thử đăng lại.")],
  ["viewer not a friend", t("Chỉ gửi ảnh được cho người đã là bạn của bạn.")],
  ["photo not found", t("Ảnh này không còn nữa.")],
  ["too many events", t("Mỗi lần nhập được tối đa 1.000 sự kiện.")],
  ["invalid import", t("Có một sự kiện trong file không lưu được, nên chưa có gì được nhập. Hãy xuất lại file rồi thử lần nữa.")],
  // What the Supabase client says when a server function cannot be called, or refuses without a reason.
  // A function that is not deployed looks like a lost connection to a browser: its preflight request fails.
  ["Failed to send a request to the Edge Function", t("Chưa gọi được máy chủ cho việc này. Kiểm tra mạng rồi thử lại. Nếu vẫn không được, tính năng này chưa được bật trên máy chủ.")],
  ["Edge Function returned a non-2xx status code", t("Máy chủ chưa làm được việc này. Hãy thử lại sau.")],
];

// What a server function answers when it refuses, word for word. These are plain words that could be
// part of some other message, so they count only when they are the whole message.
const refusals: Record<string, string> = {
  "push not configured": t("Máy chủ chưa có khóa để gửi thông báo đẩy."),
  "unauthorized": t("Phiên đăng nhập đã hết hạn. Hãy đăng nhập lại."),
  "server not configured": t("Máy chủ chưa làm được việc này. Hãy thử lại sau."),
  "account deletion failed": t("Máy chủ chưa làm được việc này. Hãy thử lại sau."),
  "temporarily unavailable": t("Máy chủ chưa làm được việc này. Hãy thử lại sau."),
};

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
  return refusals[text] ?? known.find(([code]) => text.includes(code))?.[1] ?? (text || fallback);
}

/** A rule of the app was broken. `message` is ready to show; `code` is for code that reacts to it. */
export class DomainError extends Error {
  constructor(readonly code: string, message: string) {
    super(message);
    this.name = "DomainError";
  }
}

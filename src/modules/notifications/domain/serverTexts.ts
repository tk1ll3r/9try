import { t } from "../../../kernel/i18n";

/**
 * A notification's title and text are written by the database, in Vietnamese (see the functions in
 * supabase/migrations). These are the ones it writes the same way every time. They are listed here
 * so that every language has to translate them: `src/i18n.test.ts` checks this list.
 */
export const serverTexts: readonly string[] = [
  "Lời mời kết bạn", "Có người muốn kết nối với bạn.",
  "Đã kết bạn", "Hai bạn đã có thể lên kế hoạch cùng nhau.",
  "Lời mời đã được chấp nhận", "Hai bạn đã kết nối.",
  "Có bạn mới qua liên kết", "Một người vừa dùng liên kết kết bạn của bạn.",
  "Lời mời hoạt động", "Hoạt động có thay đổi", "Đã chốt thời gian", "Hoạt động đã hủy",
  "Mở bản đồ nếu bạn muốn chia sẻ vị trí.",
  "Nhắc việc", "Bạn có một việc sắp tới.",
];

/**
 * A notification's title or text in the reader's language. What a person wrote, such as the name of
 * a meetup, stays as it is.
 */
export function shownText(text: string): string {
  const chat = /^Tin nhắn mới · (.+)$/s.exec(text);
  if (chat) return t("Tin nhắn mới · {0}", chat[1]);
  const asking = /^(.+) muốn biết bạn đang ở đâu$/s.exec(text);
  if (asking) return t("{0} muốn biết bạn đang ở đâu", asking[1]);
  return serverTexts.includes(text) ? t(text) : text;
}

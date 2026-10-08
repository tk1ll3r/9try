import { t } from "../../../kernel/i18n";
export const returnPathKey = "gnouht-login-return-path";
/**
 * `path` must be a plain in-app path (`isPlainPath`), or the link could lead to another site. The
 * sign-in email appends `?token_hash=…` to this address, so it must not carry a query of its own.
 */
export function loginRedirect(origin: string, path: string): string {
  return new URL(path, origin).href;
}
export function loginError(error: unknown): string {
  const detail = error && typeof error === "object" ? error as { status?: number; code?: string; message?: string } : {};
  const message = detail.message?.toLowerCase() ?? "";
  if (detail.status === 429 || message.includes("rate limit") || detail.code === "over_email_send_rate_limit") return t("Đã đạt giới hạn gửi email. Hãy đợi rồi thử lại; gửi liên tục không giúp thư đến nhanh hơn.");
  if (message.includes("not authorized") || detail.code === "email_address_not_authorized") return t("Dịch vụ email chưa cho phép gửi tới địa chỉ này. Quản trị viên cần kiểm tra SMTP và danh sách địa chỉ thử nghiệm.");
  if (message.includes("sending") || message.includes("smtp")) return t("Dịch vụ gửi thư đang gặp lỗi. Quản trị viên cần kiểm tra Auth/SMTP logs.");
  if (message.includes("invalid") && message.includes("email")) return t("Địa chỉ email không hợp lệ. Hãy kiểm tra lại.");
  return t("Chưa gửi được yêu cầu. Kiểm tra kết nối rồi thử lại. Nếu lỗi vẫn xảy ra, hãy liên hệ quản trị viên.");
}
export function isLocalBackend(url: string | undefined): boolean {
  try { return ["localhost", "127.0.0.1", "[::1]"].includes(new URL(url ?? "").hostname); } catch { return false; }
}

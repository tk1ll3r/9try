import { locale, t } from "../../../kernel/i18n";
export const meetupsKey = ["meetups"] as const;

export const statusLabel = { draft: t("Nháp"), proposed: t("Đang đề xuất"), confirmed: t("Đã chốt"), canceled: t("Đã hủy"), completed: t("Đã xong") } as const;
export const rsvpLabel = { going: t("Đi"), maybe: t("Có thể"), pending: t("Chưa trả lời"), declined: t("Không đi") } as const;

export const formatTime = (value: string) => new Intl.DateTimeFormat(locale, { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
export const formatRange = (start: string, end: string) => `${formatTime(start)} → ${new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit" }).format(new Date(end))}`;

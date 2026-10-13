import type { Room } from "../domain/Chat";
import { locale, t } from "../../../kernel/i18n";

const day = 86_400_000;
const clock = (instant: number) => new Date(instant).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
const date = (instant: number) => new Date(instant).toLocaleDateString(locale, { day: "numeric", month: "numeric" });

/**
 * When a room closes, or when a closed one is deleted, in words: "Đóng lúc 21:00 hôm nay",
 * "Đã đóng · tin nhắn bị xóa ngày 16/10". A closed room keeps its messages for seven days.
 */
export function roomTime(room: Pick<Room, "closesAt" | "closed">, now: number): string {
  const closes = Date.parse(room.closesAt);
  // An owner who closed the room early did so before `closesAt`; the seven days then end sooner than shown, never later.
  if (room.closed) return t("Đã đóng · tin nhắn bị xóa ngày {0}", date(Math.min(closes, now) + 7 * day));
  return new Date(closes).toDateString() === new Date(now).toDateString() ? t("Đóng lúc {0} hôm nay", clock(closes)) : t("Đóng lúc {0} ngày {1}", clock(closes), date(closes));
}

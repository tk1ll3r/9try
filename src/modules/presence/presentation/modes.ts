import { Beer, BookOpen, CalendarCheck2, CalendarPlus, CircleDot, Gamepad2, GraduationCap, MapPin, MessageCircle, Moon, Sparkles, Zap } from "lucide-react";

export const presenceKey = ["presence"] as const;

/** How each mode is drawn. `color` tints the ring, the glow and the tile of that mode. */
export const choices = [
  { id: "studying", label: "Học bài", Icon: BookOpen, color: "#3b82f6" },
  { id: "school", label: "Đi học", Icon: GraduationCap, color: "#8b5cf6" },
  { id: "gaming", label: "Chơi game", Icon: Gamepad2, color: "#10b981" },
  { id: "billiards", label: "Chơi Bi a", Icon: CircleDot, color: "#14b8a6" },
  { id: "drinks", label: "Nhậu", Icon: Beer, color: "#f97316" },
  { id: "sleeping", label: "Ngủ", Icon: Moon, color: "#6366f1" },
] as const;

export type ModeChoice = typeof choices[number];
export const choiceOf = (mode: string | undefined) => choices.find(choice => choice.id === mode);

export const untilTime = (expiresAt: string) => new Date(expiresAt).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });

/** "còn 1 giờ 20 phút", "còn 45 phút". */
export function timeLeft(expiresAt: string, now: number): string {
  const minutes = Math.max(1, Math.round((Date.parse(expiresAt) - now) / 60_000));
  const hours = Math.floor(minutes / 60), rest = minutes % 60;
  return `còn ${hours ? `${hours} giờ${rest ? ` ${rest} phút` : ""}` : `${rest} phút`}`;
}

const reasonIcons: Record<string, typeof Sparkles> = { meetup: CalendarCheck2, invite: CalendarPlus, unread: MessageCircle, chat: MessageCircle, location: MapPin, mode: Zap };
/** The icon in front of a reason a friend is placed high. A kind from a newer module gets the general one. */
export const reasonIcon = (kind: string) => reasonIcons[kind] ?? Sparkles;

export const durations = [[30, "30 phút"], [60, "1 giờ"], [120, "2 giờ"], [240, "4 giờ"], [480, "8 giờ"]] as const;

import {
  Beer, BellOff, BookOpen, BookOpenText, Briefcase, Bus, CalendarCheck2, CalendarPlus, CircleDot, Clapperboard, Coffee, Dumbbell,
  Gamepad2, GraduationCap, Headphones, MapPin, MessageCircle, Moon, PartyPopper, ShoppingBag, Smile, Sparkles, Trophy, Utensils, Zap,
} from "lucide-react";

export const presenceKey = ["presence"] as const;

export interface ModeChoice {
  id: string;
  label: string;
  Icon: typeof Sparkles;
  /** Tints the ring, the glow and the tile of the activity. */
  color: string;
}

/**
 * Every activity a person can show, grouped as the picker shows them. To add one, add a line here:
 * the server stores any key of the right shape (migration 0029).
 */
export const activityGroups: { title: string; items: ModeChoice[] }[] = [
  { title: "Rảnh hay bận", items: [
    { id: "free", label: "Đang rảnh", Icon: Smile, color: "#22c55e" },
    { id: "busy", label: "Đang bận", Icon: BellOff, color: "#6b7280" },
  ] },
  { title: "Học và làm", items: [
    { id: "studying", label: "Học bài", Icon: BookOpen, color: "#3b82f6" },
    { id: "school", label: "Đi học", Icon: GraduationCap, color: "#8b5cf6" },
    { id: "working", label: "Làm việc", Icon: Briefcase, color: "#64748b" },
  ] },
  { title: "Gặp gỡ", items: [
    { id: "coffee", label: "Cà phê", Icon: Coffee, color: "#a16207" },
    { id: "eating", label: "Ăn uống", Icon: Utensils, color: "#ef4444" },
    { id: "drinks", label: "Nhậu", Icon: Beer, color: "#f97316" },
    { id: "hangout", label: "Đi chơi", Icon: PartyPopper, color: "#ec4899" },
    { id: "shopping", label: "Mua sắm", Icon: ShoppingBag, color: "#06b6d4" },
  ] },
  { title: "Giải trí", items: [
    { id: "gaming", label: "Chơi game", Icon: Gamepad2, color: "#10b981" },
    { id: "billiards", label: "Chơi Bi a", Icon: CircleDot, color: "#14b8a6" },
    { id: "movie", label: "Xem phim", Icon: Clapperboard, color: "#f43f5e" },
    { id: "music", label: "Nghe nhạc", Icon: Headphones, color: "#d946ef" },
    { id: "reading", label: "Đọc sách", Icon: BookOpenText, color: "#d97706" },
  ] },
  { title: "Vận động và nghỉ", items: [
    { id: "workout", label: "Tập thể dục", Icon: Dumbbell, color: "#65a30d" },
    { id: "sport", label: "Chơi thể thao", Icon: Trophy, color: "#eab308" },
    { id: "moving", label: "Đang di chuyển", Icon: Bus, color: "#0ea5e9" },
    { id: "sleeping", label: "Ngủ", Icon: Moon, color: "#6366f1" },
  ] },
];

export const choices: ModeChoice[] = activityGroups.flatMap(group => group.items);
/** Shown for a key this version of the app does not know, such as one added by a newer version. */
const other: ModeChoice = { id: "other", label: "Đang làm việc khác", Icon: Sparkles, color: "#6b7280" };
export const choiceOf = (mode: string | undefined): ModeChoice | undefined => mode ? choices.find(choice => choice.id === mode) ?? other : undefined;

/** The activities offered for one tap when nothing was chosen before. */
export const quickDefaults = ["free", "studying", "school", "gaming", "coffee"];

export const untilTime = (expiresAt: string) => new Date(expiresAt).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" });

/** "còn 1 giờ 20 phút", "còn 45 phút". */
export function timeLeft(expiresAt: string, now: number): string {
  const minutes = Math.max(1, Math.round((Date.parse(expiresAt) - now) / 60_000));
  const hours = Math.floor(minutes / 60), rest = minutes % 60;
  return `còn ${hours ? `${hours} giờ${rest ? ` ${rest} phút` : ""}` : `${rest} phút`}`;
}

const reasonIcons: Record<string, typeof Sparkles> = { meetup: CalendarCheck2, invite: CalendarPlus, unread: MessageCircle, chat: MessageCircle, location: MapPin, mode: Zap, free: Smile };
/** The icon in front of a reason a friend is placed high. A kind from a newer module gets the general one. */
export const reasonIcon = (kind: string) => reasonIcons[kind] ?? Sparkles;

export const durations = [[30, "30 phút"], [60, "1 giờ"], [120, "2 giờ"], [240, "4 giờ"], [480, "8 giờ"]] as const;
export const durationLabel = (minutes: number) => durations.find(([value]) => value === minutes)?.[1] ?? `${minutes} phút`;

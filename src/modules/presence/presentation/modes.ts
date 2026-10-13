import {
  Beer, BellOff, Bike, BookOpen, BookOpenText, Briefcase, Bus, CalendarCheck2, CalendarPlus, Camera, CarFront, CircleDot, Clapperboard, Coffee, Dumbbell,
  Gamepad2, Gift, GraduationCap, Headphones, Heart, Home, Laptop, Leaf, MapPin, MessageCircle, MessagesSquare, Moon, Palette, PawPrint, PartyPopper, Pizza,
  Plane, ShoppingBag, Smile, Sparkles, Star, Sun, Trophy, Utensils, Zap,
} from "lucide-react";
import { locale, t } from "../../../kernel/i18n";
import type { CustomModeIcon } from "../domain/ActivityMode";

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
  { title: t("Rảnh hay bận"), items: [
    { id: "free", label: t("Đang rảnh"), Icon: Smile, color: "#22c55e" },
    { id: "busy", label: t("Đang bận"), Icon: BellOff, color: "#6b7280" },
  ] },
  { title: t("Học và làm"), items: [
    { id: "studying", label: t("Học bài"), Icon: BookOpen, color: "#3b82f6" },
    { id: "school", label: t("Đi học"), Icon: GraduationCap, color: "#8b5cf6" },
    { id: "working", label: t("Làm việc"), Icon: Briefcase, color: "#64748b" },
  ] },
  { title: t("Gặp gỡ"), items: [
    { id: "coffee", label: t("Cà phê"), Icon: Coffee, color: "#a16207" },
    { id: "eating", label: t("Ăn uống"), Icon: Utensils, color: "#ef4444" },
    { id: "drinks", label: t("Nhậu"), Icon: Beer, color: "#f97316" },
    { id: "hangout", label: t("Đi chơi"), Icon: PartyPopper, color: "#ec4899" },
    { id: "shopping", label: t("Mua sắm"), Icon: ShoppingBag, color: "#06b6d4" },
  ] },
  { title: t("Giải trí"), items: [
    { id: "gaming", label: t("Chơi game"), Icon: Gamepad2, color: "#10b981" },
    { id: "billiards", label: t("Chơi Bi a"), Icon: CircleDot, color: "#14b8a6" },
    { id: "movie", label: t("Xem phim"), Icon: Clapperboard, color: "#f43f5e" },
    { id: "music", label: t("Nghe nhạc"), Icon: Headphones, color: "#d946ef" },
    { id: "reading", label: t("Đọc sách"), Icon: BookOpenText, color: "#d97706" },
  ] },
  { title: t("Vận động và nghỉ"), items: [
    { id: "workout", label: t("Tập thể dục"), Icon: Dumbbell, color: "#65a30d" },
    { id: "sport", label: t("Chơi thể thao"), Icon: Trophy, color: "#eab308" },
    { id: "moving", label: t("Đang di chuyển"), Icon: Bus, color: "#0ea5e9" },
    { id: "sleeping", label: t("Ngủ"), Icon: Moon, color: "#6366f1" },
  ] },
];

export const choices: ModeChoice[] = activityGroups.flatMap(group => group.items);
/** Shown for a key this version of the app does not know, such as one added by a newer version. */
const other: ModeChoice = { id: "other", label: t("Đang làm việc khác"), Icon: Sparkles, color: "#6b7280" };
export const customModeColors = ["#22c55e", "#3b82f6", "#8b5cf6", "#a16207", "#ec4899", "#ef4444", "#06b6d4", "#d97706"] as const;
export const customModeIcons: Record<CustomModeIcon, ModeChoice["Icon"]> = {
  sparkles: Sparkles, coffee: Coffee, book: BookOpen, briefcase: Briefcase, game: Gamepad2, smile: Smile, camera: Camera, food: Utensils,
  heart: Heart, star: Star, music: Headphones, leaf: Leaf, sun: Sun, moon: Moon, paw: PawPrint, bike: Bike,
  car: CarFront, plane: Plane, home: Home, laptop: Laptop, palette: Palette, pizza: Pizza, gift: Gift, dumbbell: Dumbbell,
};
export const customModeIconOptions: { id: CustomModeIcon; label: string }[] = [
  { id: "sparkles", label: t("Lấp lánh") }, { id: "coffee", label: t("Cà phê") }, { id: "book", label: t("Sách") },
  { id: "briefcase", label: t("Công việc") }, { id: "game", label: t("Trò chơi") }, { id: "smile", label: t("Vui vẻ") },
  { id: "camera", label: t("Máy ảnh") }, { id: "food", label: t("Đồ ăn") },
  { id: "heart", label: t("Tình yêu") }, { id: "star", label: t("Ngôi sao") }, { id: "music", label: t("Âm nhạc") }, { id: "leaf", label: t("Thiên nhiên") },
  { id: "sun", label: t("Mặt trời") }, { id: "moon", label: t("Mặt trăng") }, { id: "paw", label: t("Thú cưng") }, { id: "bike", label: t("Đạp xe") },
  { id: "car", label: t("Ô tô") }, { id: "plane", label: t("Du lịch") }, { id: "home", label: t("Ở nhà") }, { id: "laptop", label: t("Máy tính") },
  { id: "palette", label: t("Nghệ thuật") }, { id: "pizza", label: t("Pizza") }, { id: "gift", label: t("Quà tặng") }, { id: "dumbbell", label: t("Thể dục") },
];
type ModePresentation = {
  label?: string | null; icon?: CustomModeIcon | null; color?: string | null;
  modeLabel?: string | null; modeIcon?: CustomModeIcon | null; modeColor?: string | null;
};
export const choiceOf = (mode: string | undefined, presentation?: ModePresentation | null): ModeChoice | undefined => {
  if (!mode) return undefined;
  const builtin = choices.find(choice => choice.id === mode);
  if (builtin) return builtin;
  const label = presentation?.label ?? presentation?.modeLabel;
  const icon = presentation?.icon ?? presentation?.modeIcon;
  const color = presentation?.color ?? presentation?.modeColor;
  if (label && icon && color) {
    return { id: mode, label, Icon: customModeIcons[icon], color };
  }
  return { ...other, id: mode };
};

/** The activities offered for one tap when nothing was chosen before. */
export const quickDefaults = ["free", "studying", "school", "gaming", "coffee"];

export const untilTime = (expiresAt: string) => new Date(expiresAt).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });

/** "còn 1 giờ 20 phút", "còn 45 phút". */
export function timeLeft(expiresAt: string, now: number): string {
  const minutes = Math.max(1, Math.round((Date.parse(expiresAt) - now) / 60_000));
  const hours = Math.floor(minutes / 60), rest = minutes % 60;
  return t("còn {0}", hours ? t("{0} giờ{1}", hours, rest ? t(" {0} phút", rest) : "") : t("{0} phút", rest));
}

const reasonIcons: Record<string, typeof Sparkles> = { meetup: CalendarCheck2, invite: CalendarPlus, room: MessagesSquare, unread: MessageCircle, chat: MessageCircle, location: MapPin, mode: Zap, free: Smile, moment: Camera };
/** The icon in front of a reason a friend is placed high. A kind from a newer module gets the general one. */
export const reasonIcon = (kind: string) => reasonIcons[kind] ?? Sparkles;

export const durations = [[30, t("30 phút")], [60, t("1 giờ")], [120, t("2 giờ")], [240, t("4 giờ")], [480, t("8 giờ")]] as const;
export const durationLabel = (minutes: number) => durations.find(([value]) => value === minutes)?.[1] ?? t("{0} phút", minutes);

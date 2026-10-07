import { Beer, BookOpen, CircleDot, Gamepad2, GraduationCap, Moon } from "lucide-react";

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

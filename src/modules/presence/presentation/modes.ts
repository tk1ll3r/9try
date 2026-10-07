import { Beer, BookOpen, CircleDot, Gamepad2, GraduationCap, Moon } from "lucide-react";

export const presenceKey = ["presence"] as const;

/** How each mode is drawn. A mode the server does not know yet is simply not offered. */
export const choices = [
  { id: "studying", label: "Học bài", Icon: BookOpen, color: "text-blue-700 bg-blue-100" },
  { id: "school", label: "Đi học", Icon: GraduationCap, color: "text-violet-700 bg-violet-100" },
  { id: "gaming", label: "Chơi game", Icon: Gamepad2, color: "text-emerald-700 bg-emerald-100" },
  { id: "billiards", label: "Chơi Bi a", Icon: CircleDot, color: "text-teal-700 bg-teal-100" },
  { id: "drinks", label: "Nhậu", Icon: Beer, color: "text-orange-700 bg-orange-100" },
  { id: "sleeping", label: "Ngủ", Icon: Moon, color: "text-indigo-700 bg-indigo-100" },
] as const;

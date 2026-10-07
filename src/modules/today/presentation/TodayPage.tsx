import { Check, MapPin, NotebookPen, Repeat, Users, UsersRound } from "lucide-react";
import { Link } from "react-router-dom";
import { useRegistry } from "../../../kernel/session";
import { Card } from "../../../kernel/ui/Card";
import { ProfileReminder } from "../../identity";

const shortcuts = [
  { to: "/meetups", label: "Đề xuất cuộc hẹn", Icon: UsersRound },
  { to: "/me/friends", label: "Bạn bè và lời mời", Icon: Users },
  { to: "/me/organizer", label: "Việc cần làm và nhắc việc", Icon: Check },
  { to: "/habits", label: "Thói quen", Icon: Repeat },
  { to: "/notes", label: "Ghi chú", Icon: NotebookPen },
  { to: "/me/location", label: "Chia sẻ vị trí có thời hạn", Icon: MapPin },
];

/** The home screen. Each module adds its own card through `today`; a card with nothing to say stays away. */
export function TodayPage() {
  const { today } = useRegistry();
  return <div className="space-y-5">
    <header><p className="text-sm font-semibold text-[var(--muted)]">{new Intl.DateTimeFormat("vi-VN", { weekday: "long", day: "numeric", month: "long" }).format(new Date())}</p>
      <h1 className="mt-1 text-4xl font-black tracking-[-.045em] sm:text-5xl">Hôm nay mình có gì?</h1></header>
    <ProfileReminder />
    {/* Two columns on a wide screen, filled top to bottom so that a short card leaves no hole beside a tall one. */}
    <div className="space-y-5 xl:columns-2 xl:gap-5 xl:space-y-0 xl:*:mb-5 xl:*:break-inside-avoid">
      {today.map(({ card: TodayCard }, index) => <TodayCard key={index} />)}
    </div>
    <Card title="Lên kế hoạch cùng nhau">
      <div className="grid gap-2 sm:grid-cols-2">
        {shortcuts.map(({ to, label, Icon }) => <Link key={to} to={to} className="flex min-h-12 items-center gap-3 rounded-2xl bg-[var(--soft)] px-4 py-3 font-semibold hover:underline"><Icon size={19} /> {label}</Link>)}
      </div>
    </Card>
  </div>;
}

import { Check, MapPin, Users, UsersRound } from "lucide-react";
import { Link } from "react-router-dom";
import { Card } from "../../../shared/ui/Card";
import { UpcomingCard } from "../../calendar";
import { useMyGroups } from "../../groups";
import { ProfileReminder } from "../../identity";
import { TodayTasksCard } from "../../tasks";

/** The home screen: each card belongs to a module and loads on its own. */
export function TodayPage() {
  const groups = useMyGroups();
  return <div className="space-y-5">
    <header><p className="text-sm font-semibold text-[var(--muted)]">{new Intl.DateTimeFormat("vi-VN", { weekday: "long", day: "numeric", month: "long" }).format(new Date())}</p>
      <h1 className="mt-1 text-4xl font-black tracking-[-.045em] sm:text-5xl">Hôm nay mình có gì?</h1></header>
    <ProfileReminder />
    <div className="grid gap-5 xl:grid-cols-[1.2fr_.8fr]">
      <UpcomingCard />
      <TodayTasksCard />
    </div>
    <Card title="Lên kế hoạch cùng nhau">
      <div className="grid gap-2 sm:grid-cols-2">
        <Link to="/meetups" className="flex min-h-12 items-center gap-3 rounded-2xl bg-[var(--soft)] px-4 py-3 font-semibold hover:underline"><UsersRound size={19} /> Đề xuất cuộc hẹn</Link>
        <Link to="/me/friends" className="flex min-h-12 items-center gap-3 rounded-2xl bg-[var(--soft)] px-4 py-3 font-semibold hover:underline"><Users size={19} /> Bạn bè và lời mời</Link>
        <Link to="/me/organizer" className="flex min-h-12 items-center gap-3 rounded-2xl bg-[var(--soft)] px-4 py-3 font-semibold hover:underline"><Check size={19} /> Việc, ghi chú và thói quen</Link>
        <Link to="/me/location" className="flex min-h-12 items-center gap-3 rounded-2xl bg-[var(--soft)] px-4 py-3 font-semibold hover:underline"><MapPin size={19} /> Chia sẻ vị trí có thời hạn</Link>
      </div>
    </Card>
    <Card title="Nhóm gần đây" action={<Link to="/groups" className="text-sm font-semibold underline">Tất cả nhóm</Link>}>
      {groups.data?.length ? groups.data.slice(0, 6).map(group => <Link key={group.id} to={`/groups/${group.id}`} className="mr-2 mb-2 inline-flex min-h-11 items-center gap-2 rounded-full bg-[var(--soft)] px-3 py-2 font-semibold hover:underline"><UsersRound size={16} />{group.name}</Link>)
        : <p className="text-sm text-[var(--muted)]">{groups.isPending ? "Đang tải nhóm…" : groups.isError ? "Chưa tải được nhóm." : "Chưa có nhóm nào. Tạo nhóm để lên kế hoạch chung."}</p>}
    </Card>
  </div>;
}

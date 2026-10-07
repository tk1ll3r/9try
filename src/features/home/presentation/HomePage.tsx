import { useEffect, useRef, useState } from "react";
import { CalendarClock, Check, MapPin, Users, UsersRound } from "lucide-react";
import { Link } from "react-router-dom";
import { useAuth } from "../../../bootstrap/AuthProvider";
import { useMyGroups } from "../../../modules/groups";
import { ProfileReminder } from "../../../modules/identity";
import { TodayTasksCard } from "../../../modules/tasks";
import { appData } from "../../../shared/infrastructure/AppData";
import { Button } from "../../../shared/ui/Button";
import { Card } from "../../../shared/ui/Card";
import type { CalendarOccurrence } from "../../calendars/infrastructure/CalendarData";
import { formatOccurrence } from "../domain/upcoming";
import { AsyncOwnerScope } from "../../../shared/domain/AsyncOwnerScope";


export function HomePage() {
  const { user } = useAuth();
  const [events, setEvents] = useState<CalendarOccurrence[]>([]);
  const groups = useMyGroups();
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const scope = useRef(new AsyncOwnerScope());

  async function refresh() {
    if (!user) return;
    const current = scope.current.beginRequest(user.id);
    if (!current()) return;
    setLoading(true);
    try { const result = await appData.home(user.id); if (current()) { setEvents(result.events); setError(""); } }
    catch (e) { if (current()) setError(e instanceof Error ? e.message : "Không thể tải dữ liệu"); }
    finally { if (current()) setLoading(false); }
  }
  useEffect(() => {
    scope.current.activate(user?.id);
    setEvents([]); setError("");
    void refresh(); return () => { scope.current.dispose(); };
  }, [user?.id]);

  return <div className="space-y-5">
    <header><p className="text-sm font-semibold text-[var(--muted)]">{new Intl.DateTimeFormat("vi-VN",{ weekday:"long",day:"numeric",month:"long" }).format(new Date())}</p>
      <h1 className="mt-1 text-4xl font-black tracking-[-.045em] sm:text-5xl">Hôm nay mình có gì?</h1></header>
    <ProfileReminder />
    {error && <div role="alert" className="rounded-2xl bg-[var(--soft)] p-4 text-[var(--danger)]">{error} <Button variant="ghost" onClick={() => void refresh()} disabled={loading}>Thử lại</Button></div>}
    {loading && <p role="status">Đang tải hôm nay…</p>}
    <div aria-busy={loading} className="grid gap-5 xl:grid-cols-[1.2fr_.8fr]">
      <Card title="Sắp tới" action={<Link className="text-sm font-semibold underline" to="/calendar">Mở lịch</Link>}>
        {events.length ? events.map((e) => <div key={e.id} className="mb-2 rounded-2xl bg-[var(--soft)] p-4"><b>{e.title}</b><p className="text-sm text-[var(--muted)]">{formatOccurrence(e)}</p></div>) :
          <div className="py-10 text-center text-[var(--muted)]"><CalendarClock className="mx-auto mb-2"/>{loading ? "Đang tải lịch…" : error ? "Chưa tải được lịch." : "Chưa có sự kiện trong 30 ngày tới"}</div>}
      </Card>
      <TodayTasksCard />
    </div>
    <Card title="Lên kế hoạch cùng nhau">
      <div className="grid gap-2 sm:grid-cols-2">
        <Link to="/meetups" className="flex min-h-12 items-center gap-3 rounded-2xl bg-[var(--soft)] px-4 py-3 font-semibold hover:underline"><UsersRound size={19}/> Đề xuất cuộc hẹn</Link>
        <Link to="/me/friends" className="flex min-h-12 items-center gap-3 rounded-2xl bg-[var(--soft)] px-4 py-3 font-semibold hover:underline"><Users size={19}/> Bạn bè và lời mời</Link>
        <Link to="/me/organizer" className="flex min-h-12 items-center gap-3 rounded-2xl bg-[var(--soft)] px-4 py-3 font-semibold hover:underline"><Check size={19}/> Việc, ghi chú và thói quen</Link>
        <Link to="/me/location" className="flex min-h-12 items-center gap-3 rounded-2xl bg-[var(--soft)] px-4 py-3 font-semibold hover:underline"><MapPin size={19}/> Chia sẻ vị trí có thời hạn</Link>
      </div>
    </Card>
    <Card title="Nhóm gần đây" action={<Link to="/groups" className="text-sm font-semibold underline">Tất cả nhóm</Link>}>
      {groups.data?.length ? groups.data.slice(0, 6).map(group => <Link key={group.id} to={`/groups/${group.id}`} className="mr-2 mb-2 inline-flex min-h-11 items-center gap-2 rounded-full bg-[var(--soft)] px-3 py-2 font-semibold hover:underline"><UsersRound size={16}/>{group.name}</Link>)
        : <p className="text-sm text-[var(--muted)]">{groups.isPending ? "Đang tải nhóm…" : groups.isError ? "Chưa tải được nhóm." : "Chưa có nhóm nào. Tạo nhóm để lên kế hoạch chung."}</p>}
    </Card>
  </div>;
}

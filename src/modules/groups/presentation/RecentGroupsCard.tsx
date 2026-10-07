import { UsersRound } from "lucide-react";
import { Link } from "react-router-dom";
import { Card } from "../../../kernel/ui/Card";
import { useMyGroups } from "./useGroups";

/** Today's card: shortcuts to the user's groups. */
export function RecentGroupsCard() {
  const groups = useMyGroups();
  return <Card title="Nhóm của bạn" action={<Link to="/groups" className="text-sm font-semibold underline">Tất cả nhóm</Link>}>
    {groups.data?.length ? groups.data.slice(0, 6).map(group => <Link key={group.id} to={`/groups/${group.id}`} className="mr-2 mb-2 inline-flex min-h-11 items-center gap-2 rounded-full bg-[var(--soft)] px-3 py-2 font-semibold hover:underline"><UsersRound size={16} />{group.name}</Link>)
      : <p className="text-sm text-[var(--muted)]">{groups.isPending ? "Đang tải nhóm…" : groups.isError ? "Chưa tải được nhóm." : "Chưa có nhóm nào. Tạo nhóm để lên kế hoạch chung."}</p>}
  </Card>;
}

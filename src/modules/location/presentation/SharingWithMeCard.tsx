import { useQuery } from "@tanstack/react-query";
import { MapPin } from "lucide-react";
import { Link } from "react-router-dom";
import { useModule } from "../../../kernel/session";
import { Card } from "../../../kernel/ui/Card";
import { locationModule } from "../location.module";

/** Today's card: friends who share their location with the user right now. */
export function SharingWithMeCard() {
  const { locations } = useModule(locationModule);
  const visible = useQuery({ queryKey: ["location", "visible"], queryFn: () => locations.listVisible() });
  if (!visible.data?.length) return null;

  return <Card title="Đang chia sẻ vị trí với bạn" action={<Link to="/me/location" className="text-sm font-semibold underline">Mở bản đồ</Link>}>
    <ul className="flex flex-wrap gap-2">
      {visible.data.map(item => <li key={item.sessionId} className="flex items-center gap-2 rounded-2xl bg-[var(--soft)] px-3 py-2 text-sm">
        <MapPin size={16} className="text-[var(--muted)]" /><span className="font-semibold">{item.ownerDisplayName}</span>
        <span className="text-[var(--muted)]">tới {new Date(item.expiresAt).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}</span>
      </li>)}
    </ul>
  </Card>;
}

import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useModule } from "../../../kernel/session";
import { useAction } from "../../../kernel/useAction";
import { Button } from "../../../kernel/ui/Button";
import { Card } from "../../../kernel/ui/Card";
import { friendsModule } from "../friends.module";
import { friendsKey, useAcceptedFriends } from "./useFriends";
import { t } from "../../../kernel/i18n";

export function FriendsPrivacy() {
  const friends = useModule(friendsModule);
  const accepted = useAcceptedFriends();
  const shares = useQuery({ queryKey: [...friendsKey, "shares"], queryFn: () => friends.availabilitySharedWith() });
  const blocked = useQuery({ queryKey: [...friendsKey, "blocked"], queryFn: () => friends.listBlocked() });
  const { run, pending, error } = useAction(friendsKey);
  const seeing = accepted.filter(friend => shares.data?.has(friend.userId));

  return <Card title={t("Lịch bận/rảnh")} action={<Link to="/me/friends" className="card-link">{t("Mở Bạn bè")}</Link>}>
    {seeing.length ? <>
      <p className="mb-3 text-sm leading-6">{t("Những người bạn này thấy lúc nào bạn bận. Họ không thấy bạn bận việc gì.")}</p>
      <ul className="space-y-2">{seeing.map(friend => <li key={friend.userId} className="flex items-center justify-between gap-3 rounded-2xl bg-[var(--soft)] p-3">
        <span className="min-w-0 truncate font-semibold">{friend.displayName}</span>
        <Button variant="ghost" disabled={pending} onClick={() => run(() => friends.setAvailabilityShare(friend.userId, false))}>{t("Ngừng chia sẻ")}</Button>
      </li>)}</ul>
    </> : <p className="text-sm leading-6 text-[var(--muted)]">{shares.isError ? t("Chưa tải được danh sách chia sẻ.") : t("Bạn không chia sẻ lịch bận/rảnh với ai.")}</p>}
    {error && <p role="alert" className="mt-3 text-sm text-[var(--danger)]">{error}</p>}
    <p className="mt-4 text-sm text-[var(--muted)]">{t("Đã chặn {0} người. Người bị chặn không thể kết bạn, nhắn tin hay mời bạn.", blocked.data?.length ?? 0)}</p>
  </Card>;
}

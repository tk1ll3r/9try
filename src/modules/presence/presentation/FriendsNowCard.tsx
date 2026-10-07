import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useModule, useUserId } from "../../../kernel/session";
import { Card } from "../../../kernel/ui/Card";
import { useAcceptedFriends } from "../../friends";
import { presenceModule } from "../presence.module";
import { MemberAvatar } from "./MemberAvatar";
import { choiceOf, presenceKey } from "./modes";

/** Today's first card: who has a mode on right now. The Mode screen has everyone and the picker. */
export function FriendsNowCard() {
  const presence = useModule(presenceModule);
  const userId = useUserId();
  const friends = useAcceptedFriends();
  const list = useQuery({ queryKey: presenceKey, queryFn: () => presence.list(), refetchInterval: 60_000 });
  const running = (list.data ?? []).filter(item => Date.parse(item.expiresAt) > Date.now());
  const mine = choiceOf(running.find(item => item.userId === userId)?.mode);
  const others = friends.flatMap(friend => { const choice = choiceOf(running.find(item => item.userId === friend.userId)?.mode); return choice ? [{ friend, choice }] : []; });

  return <Card title="Bạn bè lúc này" action={<Link to="/" className="text-sm font-semibold underline">{mine ? "Đổi mode" : "Đặt mode"}</Link>}>
    {others.length > 0 ? <ul className="flex gap-4 overflow-x-auto px-1 pb-1 pt-2">
      {others.map(({ friend, choice }) => <li key={friend.userId} className="flex w-20 shrink-0 flex-col items-center gap-2 text-center text-xs">
        <MemberAvatar name={friend.displayName} choice={choice} />
        <b className="max-w-full truncate text-sm">{friend.displayName}</b>
        <span className="-mt-1.5 text-[var(--muted)]">{choice.label}</span>
      </li>)}
    </ul> : <p className="text-sm text-[var(--muted)]">{friends.length ? "Chưa bạn nào bật mode." : "Kết bạn để thấy mode của nhau."}</p>}
    <p className="mt-3 text-sm text-[var(--muted)]">{mine ? `Bạn đang để mode “${mine.label}”.` : "Bạn chưa bật mode."}</p>
  </Card>;
}

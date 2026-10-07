import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { useModule, useUserId } from "../../../kernel/session";
import { Card } from "../../../kernel/ui/Card";
import { useAcceptedFriends } from "../../friends";
import { presenceModule } from "../presence.module";
import { choices, presenceKey } from "./modes";

/** Today's card: what friends say they are doing right now, and the user's own mode. */
export function FriendsNowCard() {
  const presence = useModule(presenceModule);
  const userId = useUserId();
  const friends = useAcceptedFriends();
  const list = useQuery({ queryKey: presenceKey, queryFn: () => presence.list(), refetchInterval: 60_000 });
  const running = (list.data ?? []).filter(item => Date.parse(item.expiresAt) > Date.now());
  const choiceOf = (id: string) => choices.find(choice => choice.id === running.find(item => item.userId === id)?.mode);
  const mine = choiceOf(userId);
  const others = friends.flatMap(friend => { const choice = choiceOf(friend.userId); return choice ? [{ friend, choice }] : []; });
  if (!mine && !others.length) return null;

  return <Card title="Bạn bè lúc này" action={<Link to="/meetups" className="text-sm font-semibold underline">Đặt mode</Link>}>
    {others.length > 0 && <ul className="flex flex-wrap gap-2">
      {others.map(({ friend, choice }) => <li key={friend.userId} className="flex items-center gap-2 rounded-2xl bg-[var(--soft)] px-3 py-2 text-sm">
        <span className={`flex size-8 items-center justify-center rounded-xl ${choice.color}`}><choice.Icon size={17} /></span>
        <span className="font-semibold">{friend.displayName}</span><span className="text-[var(--muted)]">{choice.label}</span>
      </li>)}
    </ul>}
    {mine && <p className={`text-sm text-[var(--muted)] ${others.length ? "mt-3" : ""}`}>Bạn đang để mode “{mine.label}”.</p>}
  </Card>;
}

import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Link2Off } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { errorMessage } from "../../../kernel/errors";
import { useModule } from "../../../kernel/session";
import { Card } from "../../../shared/ui/Card";
import { friendsModule } from "../friends.module";
import { friendsKey } from "./useFriends";

/** Opened from a personal link: makes the signed-in user a friend of the link's owner. */
export function FriendInvitePage() {
  const { token = "" } = useParams();
  const friends = useModule(friendsModule);
  // Using a link twice changes nothing, so a repeated call is harmless.
  const claim = useQuery({ queryKey: [...friendsKey, "claim", token], queryFn: () => friends.claimInvite(token).then(() => true), staleTime: Infinity });

  return (
    <div className="mx-auto max-w-xl pt-10">
      <Card>
        <div className="py-8 text-center">
          {claim.isSuccess ? <CheckCircle2 className="mx-auto text-emerald-600" size={42} /> : claim.isError ? <Link2Off className="mx-auto text-red-500" size={42} /> : <div className="mx-auto size-10 animate-pulse rounded-full bg-[var(--soft)]" />}
          <h1 className="mt-5 text-2xl font-black">{claim.isSuccess ? "Hai bạn đã là bạn bè" : claim.isError ? "Liên kết không dùng được" : "Đang kết bạn…"}</h1>
          {claim.isError && <p role="alert" className="mt-2 text-[var(--muted)]">{errorMessage(claim.error, "Không dùng được liên kết này.")}</p>}
          {!claim.isPending && <Link to="/me/friends" className="mt-6 inline-flex min-h-11 items-center rounded-2xl bg-[var(--ink)] px-4 text-sm font-semibold text-[var(--paper)]">Mở danh sách bạn bè</Link>}
        </div>
      </Card>
    </div>
  );
}

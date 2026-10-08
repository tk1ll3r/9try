import { useQuery } from "@tanstack/react-query";
import { CheckCircle2, Link2Off } from "lucide-react";
import { Link, useParams } from "react-router-dom";
import { useModule } from "../../../kernel/session";
import { Card } from "../../../kernel/ui/Card";
import { groupsModule } from "../groups.module";
import { groupsKey } from "./useGroups";
import { t } from "../../../kernel/i18n";

function reason(error: unknown) {
  const text = error && typeof error === "object" && "message" in error ? String(error.message) : "";
  return text.includes("expired") ? t("Liên kết mời đã hết hạn.")
    : text.includes("revoked") ? t("Liên kết mời đã bị thu hồi.")
    : text.includes("exhausted") ? t("Liên kết mời đã hết lượt sử dụng.")
    : t("Không thể sử dụng liên kết mời này.");
}

/** Opened from a group invite link: adds the signed-in user to the group. */
export function GroupInvitePage() {
  const { token = "" } = useParams();
  const groups = useModule(groupsModule);
  // Joining twice with the same link does not use a second slot, so a repeated call is harmless.
  const claim = useQuery({ queryKey: [...groupsKey, "claim", token], queryFn: () => groups.claimInvite(token), staleTime: Infinity });

  return (
    <div className="mx-auto max-w-xl pt-10">
      <Card>
        <div className="py-8 text-center">
          {claim.isSuccess ? <CheckCircle2 className="mx-auto text-emerald-600" size={42} /> : claim.isError ? <Link2Off className="mx-auto text-red-500" size={42} /> : <div className="mx-auto size-10 animate-pulse rounded-full bg-[var(--soft)]" />}
          <h1 className="mt-5 text-2xl font-black">{claim.isSuccess ? t("Xong rồi!") : claim.isError ? t("Lời mời không dùng được") : t("Đang tham gia nhóm")}</h1>
          <p className="mt-2 text-[var(--muted)]">{claim.isSuccess ? t("Bạn đã tham gia nhóm.") : claim.isError ? reason(claim.error) : t("Đang kiểm tra lời mời…")}</p>
          {!claim.isPending && <Link to={claim.isSuccess ? `/groups/${claim.data}` : "/groups"} className="mt-6 inline-flex min-h-11 items-center rounded-2xl bg-[var(--ink)] px-4 text-sm font-semibold text-[var(--paper)]">{claim.isSuccess ? t("Mở nhóm") : t("Mở danh sách nhóm")}</Link>}
        </div>
      </Card>
    </div>
  );
}

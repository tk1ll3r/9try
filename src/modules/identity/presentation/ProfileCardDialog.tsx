import { useQuery } from "@tanstack/react-query";
import type { ReactNode } from "react";
import { errorMessage } from "../../../kernel/errors";
import { useModule } from "../../../kernel/session";
import { Avatar } from "../../../kernel/ui/Avatar";
import { DialogPanel } from "../../../kernel/ui/DialogPanel";
import { identityModule } from "../identity.module";
import { birthdayText } from "../domain/Profile";
import { profileKey } from "./useProfile";
import { t } from "../../../kernel/i18n";
import { useMomentStreaks } from "../../moments";

/**
 * A friend's card: their picture, name, and the parts of the profile they show to friends. `name` is
 * shown until the card has loaded. `children` are the things to do with this person, such as a link
 * to the conversation.
 */
export function ProfileCardDialog({ userId, name, open, onOpenChange, children }: {
  userId: string; name: string; open: boolean; onOpenChange(open: boolean): void; children?: ReactNode;
}) {
  const profiles = useModule(identityModule);
  const streak = useMomentStreaks(open).get(userId) ?? 0;
  const card = useQuery({ queryKey: [...profileKey, "card", userId], queryFn: () => profiles.card(userId), enabled: open });
  const shown = card.data;
  return <DialogPanel size="sm" open={open} onOpenChange={onOpenChange} title={shown?.displayName || name} description={shown?.username ? `@${shown.username}` : t("Hồ sơ bạn bè")}>
    <div className="flex items-start gap-4">
      <Avatar name={shown?.displayName || name} src={shown?.avatarUrl} className="size-20 shrink-0 bg-[var(--ink)] text-3xl font-black text-[var(--paper)]" />
      <div className="min-w-0 flex-1 text-sm leading-6">
        {card.isPending && <p role="status" className="text-[var(--muted)]">{t("Đang tải hồ sơ…")}</p>}
        {card.isError && <p role="alert" className="text-[var(--danger)]">{errorMessage(card.error, t("Không thể tải hồ sơ."))}</p>}
        {streak >= 3 && <p className="mb-2 inline-flex rounded-full bg-[var(--lime)] px-2.5 py-1 text-xs font-bold text-[var(--ink)]">🔥 {t("Chuỗi đăng tin {0} ngày", streak)}</p>}
        {card.isSuccess && !shown && <p className="text-[var(--muted)]">{t("Chỉ bạn bè mới xem được hồ sơ của nhau.")}</p>}
        {shown && (shown.bio ? <p className="whitespace-pre-wrap break-words">{shown.bio}</p> : <p className="text-[var(--muted)]">{t("Chưa có lời giới thiệu.")}</p>)}
        {shown?.birthday && <p className="mt-1 text-[var(--muted)]">{t("Sinh nhật {0}", birthdayText(shown.birthday))}</p>}
      </div>
    </div>
    {children && <div className="mt-5 flex flex-wrap gap-2">{children}</div>}
  </DialogPanel>;
}

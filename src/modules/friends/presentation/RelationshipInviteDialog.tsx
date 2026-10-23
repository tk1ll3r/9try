import { HeartHandshake } from "lucide-react";
import { useState, type FormEvent } from "react";
import { t } from "../../../kernel/i18n";
import { useModule } from "../../../kernel/session";
import { useAction } from "../../../kernel/useAction";
import { Button } from "../../../kernel/ui/Button";
import { DialogPanel } from "../../../kernel/ui/DialogPanel";
import { friendsModule } from "../friends.module";
import { friendsKey } from "./useFriends";

const suggestions = [t("Tình bạn"), t("Bạn thân"), t("Tình yêu"), t("Mập"), t("Gia đình"), t("Đồng nghiệp"), t("Khác")];

export function RelationshipInviteDialog({
  friendId, friendName, open, onOpenChange, onSent,
}: {
  friendId: string;
  friendName: string;
  open: boolean;
  onOpenChange(open: boolean): void;
  onSent?(inviteId: string, relationship: string): Promise<void> | void;
}) {
  const repository = useModule(friendsModule);
  const { run, pending, error } = useAction(friendsKey);
  const [label, setLabel] = useState(t("Bạn thân"));

  function send(event: FormEvent) {
    event.preventDefault();
    const relationship = label.trim();
    if (!relationship) return;
    run(async () => {
      const inviteId = await repository.sendRelationshipInvite(friendId, relationship);
      try { await onSent?.(inviteId, relationship); } catch { /* The inbox invitation remains valid if posting its chat card fails. */ }
      return inviteId;
    }, () => onOpenChange(false));
  }

  return <DialogPanel open={open} onOpenChange={onOpenChange} busy={pending} size="sm" title={t("Đề nghị quan hệ")}
    description={t("Gửi cho {0}. Mối quan hệ chỉ được tạo khi người ấy đồng ý.", friendName)}>
    <form onSubmit={send} className="space-y-4">
      <div className="flex items-center gap-3 rounded-2xl bg-[var(--soft)] p-3">
        <span className="grid size-11 shrink-0 place-items-center rounded-2xl bg-[var(--surface)] text-[var(--lime-strong)]"><HeartHandshake size={21} /></span>
        <p className="text-sm leading-5 text-[var(--muted)]">{t("Bạn có thể hủy lời mời khi người ấy chưa trả lời.")}</p>
      </div>
      <fieldset className="space-y-2">
        <legend className="text-sm font-semibold">{t("Bạn muốn đề nghị kiểu quan hệ nào?")}</legend>
        <div className="flex flex-wrap gap-2">
          {suggestions.map(item => <button key={item} type="button" aria-pressed={label === item} onClick={() => setLabel(item)}
            className={`relationship-kind-option min-h-11 rounded-full border px-3.5 text-sm font-semibold transition-colors ${label === item ? "border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)]" : "border-[var(--border)] bg-[var(--surface)]"}`}>{item}</button>)}
        </div>
        <label className="block space-y-1.5 text-sm font-semibold" htmlFor="relationship-invite-label">{t("Hoặc tự đặt tên")}
          <input id="relationship-invite-label" className="field mt-1 w-full" value={label} onChange={event => setLabel(event.target.value)} maxLength={40} />
        </label>
      </fieldset>
      {error && <p role="alert" className="text-sm text-[var(--danger)]">{error}</p>}
      <Button className="w-full" type="submit" disabled={pending || !label.trim()}>{pending ? t("Đang gửi…") : t("Gửi lời mời quan hệ")}</Button>
    </form>
  </DialogPanel>;
}

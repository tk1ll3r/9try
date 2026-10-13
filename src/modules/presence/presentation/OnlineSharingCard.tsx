import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useModule } from "../../../kernel/session";
import { useAction } from "../../../kernel/useAction";
import { Card } from "../../../kernel/ui/Card";
import { PeoplePicker } from "../../friends";
import { notShared, type OnlineSettings, type PresenceAudience } from "../domain/Online";
import { presenceModule } from "../presence.module";
import { onlineKey } from "./useOnline";
import { t } from "../../../kernel/i18n";

const audiences: [PresenceAudience, string][] = [["nobody", t("Không ai")], ["friends", t("Mọi bạn bè")], ["selected", t("Bạn bè tôi chọn")]];

/**
 * Who may see that the app is open on one of the person's devices. Off until they choose otherwise.
 * A choice is saved as it is made; "Bạn bè tôi chọn" waits for the first friend to be ticked.
 */
export function OnlineSharingCard() {
  const { online, heartbeat } = useModule(presenceModule);
  const stored = useQuery({ queryKey: [...onlineKey, "settings"], queryFn: () => online.settings() });
  const { run, pending, error } = useAction(onlineKey);
  // What the person chose and the server has not confirmed yet.
  const [draft, setDraft] = useState<OnlineSettings | null>(null);
  const value = draft ?? stored.data ?? notShared;
  const waiting = value.audience === "selected" && !value.viewerIds.length;

  function choose(next: OnlineSettings) {
    setDraft(next);
    if (next.audience === "selected" && !next.viewerIds.length) return;
    run(async () => {
      // After a refusal the card shows what is stored again, next to the reason.
      try { await online.save(next); } catch (cause) { setDraft(null); throw cause; }
    }, () => { heartbeat.sharingChanged(next.audience !== "nobody"); setDraft(null); });
  }

  return <Card title={t("Trạng thái mở ứng dụng")}>
    <p className="text-sm leading-6 text-[var(--muted)]">{t("Bạn bè được chọn sẽ thấy “Đang mở ứng dụng” khi Gnouht đang mở trên máy bạn. Ứng dụng không biết điện thoại của bạn bật hay tắt, và không biết bạn đang dùng ứng dụng nào khác.")}</p>
    <fieldset disabled={pending || stored.isPending} className="mt-3 grid gap-2">
      <legend className="mb-2 text-sm font-bold">{t("Ai thấy bạn đang mở ứng dụng?")}</legend>
      <div className="grid gap-2 sm:grid-cols-3">
        {audiences.map(([audience, label]) => <label key={audience} className={`flex min-h-11 items-center gap-3 rounded-2xl px-3 text-sm font-semibold ${value.audience === audience ? "bg-[var(--ink)] text-[var(--paper)]" : "bg-[var(--soft)]"}`}>
          <input type="radio" name="presence-audience" className="size-4" checked={value.audience === audience} onChange={() => choose({ ...value, audience, showLastActive: audience === "nobody" ? false : value.showLastActive })} />
          {label}
        </label>)}
      </div>
      {value.audience === "selected" && <PeoplePicker legend={t("Những người bạn được thấy")} value={value.viewerIds} onChange={viewerIds => choose({ ...value, viewerIds })} />}
      {waiting && <p role="status" className="text-sm text-[var(--warning)]">{t("Chọn ít nhất một người bạn. Cho tới lúc đó chưa ai thấy trạng thái của bạn.")}</p>}
      <label className="flex min-h-11 items-center gap-3 rounded-2xl bg-[var(--soft)] px-3 text-sm font-semibold has-[:disabled]:opacity-50">
        <input type="checkbox" className="size-4" disabled={value.audience === "nobody" || waiting} checked={value.showLastActive} onChange={event => choose({ ...value, showLastActive: event.target.checked })} />
        {t("Cho thấy cả lần gần nhất bạn mở ứng dụng")}
      </label>
    </fieldset>
    <p role="status" className="mt-3 text-sm text-[var(--muted)]">{stored.isError ? t("Chưa tải được lựa chọn của bạn.")
      : value.audience === "nobody" || waiting ? t("Hiện không ai thấy trạng thái mở ứng dụng của bạn.")
      : value.audience === "friends" ? t("Mọi bạn bè của bạn thấy khi bạn đang mở ứng dụng.")
      : t("{0} người bạn thấy khi bạn đang mở ứng dụng.", value.viewerIds.length)}</p>
    {error && <p role="alert" className="mt-2 text-sm text-[var(--danger)]">{error}</p>}
  </Card>;
}

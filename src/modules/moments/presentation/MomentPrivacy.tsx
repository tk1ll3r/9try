import { useModule } from "../../../kernel/session";
import { useAction } from "../../../kernel/useAction";
import { Button } from "../../../kernel/ui/Button";
import { Card } from "../../../kernel/ui/Card";
import { useConfirm } from "../../../kernel/ui/Confirm";
import { live } from "../domain/Moment";
import { momentsModule } from "../moments.module";
import { momentsKey, useMoments, useNow } from "./useMoments";
import { locale, t } from "../../../kernel/i18n";

/** The privacy screen's part about photos: which of the person's photos friends can see right now, and a way to end that at once. */
export function MomentPrivacy() {
  const repository = useModule(momentsModule);
  const confirm = useConfirm();
  const moments = useMoments();
  const now = useNow();
  const { run, pending, error } = useAction(momentsKey);
  const mine = live(moments.data ?? [], now).filter(moment => moment.mine);
  const until = (instant: string) => new Date(instant).toLocaleString(locale, { weekday: "short", hour: "2-digit", minute: "2-digit" });

  return <Card title={t("Ảnh trong ngày")}>
    {moments.isError ? <p className="text-sm text-[var(--muted)]">{t("Chưa tải được ảnh của bạn.")}</p>
      : mine.length === 0 ? <p className="text-sm leading-6 text-[var(--muted)]">{t("Không có story ảnh nào đang hiện với bạn bè. Ảnh hết hạn vẫn được giữ trong kho lưu trữ.")}</p>
        : <>
          <ul className="space-y-2">{mine.map(moment => <li key={moment.id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-[var(--soft)] p-3 text-sm">
            <span className="min-w-0 leading-6">{moment.audience === "friends" ? t("Mọi bạn bè thấy tới {0}", until(moment.expiresAt)) : t("Những người bạn đã chọn thấy tới {0}", until(moment.expiresAt))}
              <span className="block text-xs text-[var(--muted)]">{t("{0} người đã xem", moment.views)}{moment.caption ? ` · ${moment.caption}` : ""}</span></span>
            <Button variant="ghost" disabled={pending} onClick={() => run(() => repository.remove(moment.id))}>{t("Xóa ảnh")}</Button>
          </li>)}</ul>
          {mine.length > 1 && <Button variant="danger" className="mt-3" disabled={pending} onClick={async () => {
            if (await confirm({ title: t("Xóa hết ảnh đang hiện?"), body: t("Mọi ảnh bạn đăng trong 24 giờ qua sẽ bị xóa khỏi story và kho lưu trữ."), action: t("Xóa hết ngay") })) {
              run(async () => { for (const moment of mine) await repository.remove(moment.id); });
            }
          }}>{t("Xóa hết ngay")}</Button>}
        </>}
    {error && <p role="alert" className="mt-3 text-sm text-[var(--danger)]">{error}</p>}
  </Card>;
}

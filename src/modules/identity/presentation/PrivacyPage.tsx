import { Link } from "react-router-dom";
import { useRegistry } from "../../../kernel/session";
import { t } from "../../../kernel/i18n";

/** Everything other people can see right now. Each feature that shares something adds its own section. */
export function PrivacyPage() {
  const { modules } = useRegistry();
  return <div className="space-y-5">
    <header>
      <p className="text-sm font-semibold text-[var(--muted)]">{t("Bạn đang chia sẻ gì, với ai")}</p>
      <h1 className="mt-1 text-4xl font-black tracking-[-.045em]">{t("Quyền riêng tư")}</h1>
      <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)]">{t("Mọi thứ là riêng tư cho tới khi bạn chọn chia sẻ. Ở đây bạn thấy những gì người khác đang xem được và dừng từng thứ một.")}</p>
    </header>
    {modules.map(({ id, privacy: Section }) => Section && <Section key={id} />)}
    <div className="flex flex-wrap items-center gap-2 text-sm text-[var(--muted)]">
      <span>{t("Tải dữ liệu của bạn hoặc xóa tài khoản trong")}</span>
      <Link to="/me/settings" className="pressable inline-flex min-h-11 items-center rounded-xl bg-[var(--soft)] px-3 font-semibold text-[var(--ink)]">{t("Cài đặt")}</Link>
    </div>
  </div>;
}

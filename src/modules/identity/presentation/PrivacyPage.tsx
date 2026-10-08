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
    <p className="text-sm text-[var(--muted)]">{t("Tải dữ liệu của bạn hoặc xóa tài khoản trong")} <Link to="/me/settings" className="font-semibold underline">{t("Cài đặt")}</Link>.</p>
  </div>;
}

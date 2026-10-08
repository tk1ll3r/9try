import { useRegistry } from "../../../kernel/session";
import { Card } from "../../../kernel/ui/Card";
import { ThemeSwitch } from "../../../kernel/ui/ThemeSwitch";

/** How the app looks and behaves on this device and for this account. Each feature with something to set up adds its own section. */
export function SettingsPage() {
  const { modules } = useRegistry();
  return <div className="space-y-5">
    <header>
      <p className="text-sm font-semibold text-[var(--muted)]">Ứng dụng và tài khoản của bạn</p>
      <h1 className="mt-1 text-4xl font-black tracking-[-.045em]">Cài đặt</h1>
    </header>
    <Card title="Giao diện">
      <div className="max-w-md"><ThemeSwitch /></div>
      <p className="mt-3 text-sm leading-6 text-[var(--muted)]">“Tự động” đổi sáng, tối theo điện thoại hoặc máy tính của bạn. Lựa chọn được nhớ trên thiết bị này.</p>
    </Card>
    {modules.map(({ id, settings: Section }) => Section && <Section key={id} />)}
  </div>;
}

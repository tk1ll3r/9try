import { useEffect, useState, type FormEvent } from "react";
import { useAuth } from "../../../kernel/auth";
import { errorMessage } from "../../../kernel/errors";
import { useModule } from "../../../kernel/session";
import { useAction } from "../../../kernel/useAction";
import { Button } from "../../../kernel/ui/Button";
import { Card } from "../../../kernel/ui/Card";
import { Profile } from "../domain/Profile";
import { identityModule } from "../identity.module";
import { profileKey, useProfile } from "./useProfile";
import { t } from "../../../kernel/i18n";

const deviceZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
const zones = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [deviceZone];
const empty = { displayName: "", username: "", bio: "", timezone: deviceZone, birthday: "" };

export function ProfilePage() {
  const profiles = useModule(identityModule);
  const profile = useProfile();
  const { run, pending, error } = useAction(profileKey);
  const [value, setValue] = useState(empty);
  const [message, setMessage] = useState("");
  // An account made with Google has a name there already. It is offered in the form and kept only when the form is saved.
  const givenName = useAuth().user?.user_metadata?.full_name;
  const offeredName = typeof givenName === "string" ? givenName.trim().slice(0, 80) : "";
  useEffect(() => { if (profile.data) setValue({ ...profile.data, displayName: profile.data.displayName || offeredName }); }, [profile.data, offeredName]);
  const problem = error || (profile.isError ? errorMessage(profile.error, t("Không thể tải hồ sơ.")) : "");

  function save(event: FormEvent) {
    event.preventDefault();
    setMessage("");
    run(async () => profiles.save(Profile.check(value)), () => setMessage(t("Đã lưu hồ sơ.")));
  }

  return (
    <div className="space-y-5">
      <header>
        <p className="text-sm font-semibold text-[var(--muted)]">{t("Bạn bè thấy bạn như thế này")}</p>
        <h1 className="mt-1 text-4xl font-black tracking-[-.045em]">{t("Hồ sơ")}</h1>
      </header>

      {problem && <div role="alert" className="rounded-2xl bg-[var(--soft)] p-4 text-sm text-[var(--danger)]">{problem}</div>}
      {message && <div role="status" className="rounded-2xl bg-[var(--soft)] p-4 text-sm">{message}</div>}

      <Card>
        <form onSubmit={save} className="grid gap-3 md:grid-cols-2" aria-busy={pending}>
          <label className="grid gap-1 text-sm font-semibold">{t("Tên hiển thị")}
            <input className="field" required maxLength={80} value={value.displayName} onChange={(e) => setValue({ ...value, displayName: e.target.value })} placeholder={t("Tên bạn bè sẽ thấy")} />
          </label>
          <label className="grid gap-1 text-sm font-semibold">Username
            <input className="field" maxLength={20} autoCapitalize="none" autoCorrect="off" spellCheck={false} value={value.username} onChange={(e) => setValue({ ...value, username: e.target.value })} placeholder="vi_du_123" aria-describedby="username-help" />
            <span id="username-help" className="text-xs font-normal text-[var(--muted)]">{t("Bạn bè tìm bạn bằng username này. 3–20 ký tự: chữ thường không dấu, số, gạch dưới.")}</span>
          </label>
          <label className="grid gap-1 text-sm font-semibold md:col-span-2">{t("Giới thiệu ngắn")}
            <textarea className="field min-h-24" maxLength={500} value={value.bio} onChange={(e) => setValue({ ...value, bio: e.target.value })} />
          </label>
          <label className="grid gap-1 text-sm font-semibold">{t("Múi giờ")}
            <select className="field" value={value.timezone} onChange={(e) => setValue({ ...value, timezone: e.target.value })}>
              {!zones.includes(value.timezone) && <option value={value.timezone}>{value.timezone}</option>}
              {zones.map(zone => <option key={zone} value={zone}>{zone}</option>)}
            </select>
            {value.timezone !== deviceZone && <span className="text-xs font-normal text-[var(--muted)]">{t("Thiết bị này đang ở múi giờ")} {deviceZone}. <button type="button" className="underline" onClick={() => setValue({ ...value, timezone: deviceZone })}>{t("Dùng múi giờ này")}</button></span>}
          </label>
          <label className="grid gap-1 text-sm font-semibold">{t("Ngày sinh (tùy chọn)")}
            <input className="field" type="date" value={value.birthday} onChange={(e) => setValue({ ...value, birthday: e.target.value })} />
            <span className="text-xs font-normal text-[var(--muted)]">{t("Chỉ mình bạn thấy.")}</span>
          </label>
          <div className="md:col-span-2"><Button type="submit" disabled={pending || profile.isPending}>{pending ? t("Đang lưu…") : t("Lưu hồ sơ")}</Button></div>
        </form>
      </Card>

    </div>
  );
}

import { Download, LogOut, Trash2 } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { errorMessage } from "../../../kernel/errors";
import { useModule } from "../../../kernel/session";
import { useAction } from "../../../kernel/useAction";
import { Button } from "../../../kernel/ui/Button";
import { Card } from "../../../kernel/ui/Card";
import { Profile } from "../domain/Profile";
import { identityModule } from "../identity.module";
import { profileKey, useProfile } from "./useProfile";

const deviceZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
const zones = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [deviceZone];
const empty = { displayName: "", username: "", bio: "", timezone: deviceZone, birthday: "" };

export function ProfilePage() {
  const profiles = useModule(identityModule);
  const profile = useProfile();
  const { run, pending, error } = useAction(profileKey);
  const [value, setValue] = useState(empty);
  const [message, setMessage] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState("");
  useEffect(() => { if (profile.data) setValue({ ...profile.data }); }, [profile.data]);
  const problem = error || (profile.isError ? errorMessage(profile.error, "Không thể tải hồ sơ.") : "");

  function save(event: FormEvent) {
    event.preventDefault();
    setMessage("");
    run(async () => profiles.save(Profile.check(value)), () => setMessage("Đã lưu hồ sơ."));
  }

  function exportData() {
    setMessage("");
    run(() => profiles.exportData(), data => {
      const url = URL.createObjectURL(new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `gnouht-data-${new Date().toISOString().slice(0, 10)}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      setMessage("Đã tạo bản xuất dữ liệu của bạn.");
    });
  }

  return (
    <div className="space-y-5">
      <header>
        <p className="text-sm font-semibold text-[var(--muted)]">Không gian cá nhân</p>
        <h1 className="mt-1 text-4xl font-black tracking-[-.045em]">Tôi</h1>
      </header>

      {problem && <div role="alert" className="rounded-2xl bg-[var(--soft)] p-4 text-sm text-[var(--danger)]">{problem}</div>}
      {message && <div role="status" className="rounded-2xl bg-[var(--soft)] p-4 text-sm">{message}</div>}

      <Card title="Hồ sơ">
        <form onSubmit={save} className="grid gap-3 md:grid-cols-2" aria-busy={pending}>
          <label className="grid gap-1 text-sm font-semibold">Tên hiển thị
            <input className="field" required maxLength={80} value={value.displayName} onChange={(e) => setValue({ ...value, displayName: e.target.value })} placeholder="Tên bạn bè sẽ thấy" />
          </label>
          <label className="grid gap-1 text-sm font-semibold">Username
            <input className="field" maxLength={20} autoCapitalize="none" autoCorrect="off" spellCheck={false} value={value.username} onChange={(e) => setValue({ ...value, username: e.target.value })} placeholder="vi_du_123" aria-describedby="username-help" />
            <span id="username-help" className="text-xs font-normal text-[var(--muted)]">Bạn bè tìm bạn bằng username này. 3–20 ký tự: chữ thường không dấu, số, gạch dưới.</span>
          </label>
          <label className="grid gap-1 text-sm font-semibold md:col-span-2">Giới thiệu ngắn
            <textarea className="field min-h-24" maxLength={500} value={value.bio} onChange={(e) => setValue({ ...value, bio: e.target.value })} />
          </label>
          <label className="grid gap-1 text-sm font-semibold">Múi giờ
            <select className="field" value={value.timezone} onChange={(e) => setValue({ ...value, timezone: e.target.value })}>
              {!zones.includes(value.timezone) && <option value={value.timezone}>{value.timezone}</option>}
              {zones.map(zone => <option key={zone} value={zone}>{zone}</option>)}
            </select>
            {value.timezone !== deviceZone && <span className="text-xs font-normal text-[var(--muted)]">Thiết bị này đang ở múi giờ {deviceZone}. <button type="button" className="underline" onClick={() => setValue({ ...value, timezone: deviceZone })}>Dùng múi giờ này</button></span>}
          </label>
          <label className="grid gap-1 text-sm font-semibold">Ngày sinh (tùy chọn)
            <input className="field" type="date" value={value.birthday} onChange={(e) => setValue({ ...value, birthday: e.target.value })} />
            <span className="text-xs font-normal text-[var(--muted)]">Chỉ mình bạn thấy.</span>
          </label>
          <div className="md:col-span-2"><Button type="submit" disabled={pending || profile.isPending}>{pending ? "Đang lưu…" : "Lưu hồ sơ"}</Button></div>
        </form>
      </Card>

      <Card title="Dữ liệu & tài khoản">
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-bold">Xuất dữ liệu</p>
              <p className="mt-1 text-sm text-[var(--muted)]">Tải JSON chứa dữ liệu tài khoản mà Gnouht lưu cho bạn.</p>
            </div>
            <Button variant="ghost" disabled={pending} onClick={exportData}><Download size={17} /> Xuất dữ liệu</Button>
          </div>

          <div className="border-t border-black/8 pt-5 dark:border-white/8">
            <p className="font-bold text-[var(--danger)]">Xóa tài khoản</p>
            <p className="mt-1 text-sm leading-6 text-[var(--muted)]">Dữ liệu cá nhân của bạn sẽ bị xóa và không khôi phục được. Nếu bạn là chủ của nhóm có thành viên khác, hãy chuyển quyền chủ nhóm trước.</p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <input className="field min-w-0 flex-1" aria-label="Xác nhận xóa tài khoản" value={deleteConfirm} onChange={(e) => setDeleteConfirm(e.target.value)} placeholder='Nhập "XÓA" để xác nhận' />
              <Button variant="danger" disabled={deleteConfirm !== "XÓA" || pending} onClick={() => run(() => profiles.deleteAccount())}>
                <Trash2 size={17} /> Xóa tài khoản
              </Button>
            </div>
          </div>
        </div>
      </Card>

      <Button variant="ghost" onClick={() => void profiles.signOut()}><LogOut size={17} /> Đăng xuất</Button>
    </div>
  );
}

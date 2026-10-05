import { BookOpenText, Download, LogOut, MapPin, Trash2, Users } from "lucide-react";
import { useEffect, useState, type FormEvent, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../../bootstrap/AuthProvider";
import { appData } from "../../../shared/infrastructure/AppData";
import { Card } from "../../../shared/ui/Card";
import { Button } from "../../../shared/ui/Button";

export function ProfilePage() {
  const { user, signOut } = useAuth();
  const [value, setValue] = useState({
    display_name: "",
    username: "",
    bio: "",
    timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
  });
  const [message, setMessage] = useState("");
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    if (!user) return;
    void appData.profile(user.id).then((profile) => setValue({
      display_name: profile.display_name ?? "",
      username: profile.username ?? "",
      bio: profile.bio ?? "",
      timezone: profile.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone,
    })).catch((error: Error) => setMessage(error.message));
  }, [user?.id]);

  async function save(event: FormEvent) {
    event.preventDefault();
    if (!user) return;
    try {
      await appData.saveProfile(user.id, value);
      setMessage("Đã lưu hồ sơ.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không thể lưu hồ sơ.");
    }
  }

  async function exportData() {
    try {
      const data = await appData.exportMyData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `gnouht-data-${new Date().toISOString().slice(0, 10)}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      setMessage("Đã tạo bản xuất dữ liệu của bạn.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không thể xuất dữ liệu.");
    }
  }

  async function deleteAccount() {
    if (deleteConfirm !== "XÓA") return;
    setDeleting(true);
    try {
      await appData.deleteMyAccount();
      await signOut();
    } catch (error) {
      const text = error instanceof Error ? error.message : "Không thể xóa tài khoản.";
      setMessage(text.includes("transfer ownership") ? "Bạn đang sở hữu nhóm có thành viên khác. Hãy chuyển quyền sở hữu trước khi xóa tài khoản." : text);
      setDeleting(false);
    }
  }

  return (
    <div className="space-y-5">
      <header>
        <p className="text-sm font-semibold text-[var(--muted)]">Không gian cá nhân</p>
        <h1 className="mt-1 text-4xl font-black tracking-[-.045em]">Tôi</h1>
      </header>

      <Card title="Hồ sơ">
        <form onSubmit={save} className="grid gap-3 md:grid-cols-2">
          <input className="field" required value={value.display_name} onChange={(e) => setValue({ ...value, display_name: e.target.value })} placeholder="Tên hiển thị" />
          <input className="field" value={value.username} onChange={(e) => setValue({ ...value, username: e.target.value })} placeholder="username duy nhất" />
          <textarea className="field min-h-24 md:col-span-2" value={value.bio} onChange={(e) => setValue({ ...value, bio: e.target.value })} placeholder="Giới thiệu ngắn" />
          <input className="field" value={value.timezone} onChange={(e) => setValue({ ...value, timezone: e.target.value })} placeholder="Múi giờ" />
          <Button type="submit">Lưu hồ sơ</Button>
        </form>
        {message && <p className="mt-3 text-sm text-[var(--muted)]">{message}</p>}
      </Card>

      <div className="grid gap-4 md:grid-cols-3">
        <ToolLink to="/me/friends" icon={<Users />} title="Bạn bè" body="Lời mời, kết nối và quản lý bạn bè." />
        <ToolLink to="/me/organizer" icon={<BookOpenText />} title="Ghi chú & thói quen" body="Thông tin cá nhân luôn riêng tư mặc định." />
        <ToolLink to="/me/location" icon={<MapPin />} title="Chia sẻ vị trí" body="Phiên có thời hạn với người bạn chọn." />
      </div>

      <Card title="Dữ liệu & tài khoản">
        <div className="flex flex-col gap-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="font-bold">Xuất dữ liệu</p>
              <p className="mt-1 text-sm text-[var(--muted)]">Tải JSON chứa dữ liệu tài khoản mà Gnouht lưu cho bạn.</p>
            </div>
            <Button variant="ghost" onClick={() => void exportData()}><Download size={17} /> Xuất dữ liệu</Button>
          </div>

          <div className="border-t border-black/8 pt-5 dark:border-white/8">
            <p className="font-bold text-red-600">Xóa tài khoản</p>
            <p className="mt-1 text-sm leading-6 text-[var(--muted)]">Dữ liệu cá nhân sẽ bị xóa theo quan hệ database. Nếu bạn là owner của nhóm có thành viên khác, cần chuyển owner trước.</p>
            <div className="mt-3 flex flex-col gap-2 sm:flex-row">
              <input className="field min-w-0 flex-1" value={deleteConfirm} onChange={(e) => setDeleteConfirm(e.target.value)} placeholder='Nhập "XÓA" để xác nhận' />
              <Button variant="danger" disabled={deleteConfirm !== "XÓA" || deleting} onClick={() => void deleteAccount()}>
                <Trash2 size={17} /> {deleting ? "Đang xóa…" : "Xóa tài khoản"}
              </Button>
            </div>
          </div>
        </div>
      </Card>

      <Button variant="ghost" onClick={() => void signOut()}><LogOut size={17} /> Đăng xuất</Button>
    </div>
  );
}

function ToolLink({ to, icon, title, body }: { to: string; icon: ReactNode; title: string; body: string }) {
  return (
    <Link to={to} className="rounded-[28px] border border-black/8 bg-[var(--surface)] p-5 transition hover:-translate-y-0.5 dark:border-white/8">
      {icon}
      <b className="mt-8 block">{title}</b>
      <p className="mt-1 text-sm leading-5 text-[var(--muted)]">{body}</p>
    </Link>
  );
}

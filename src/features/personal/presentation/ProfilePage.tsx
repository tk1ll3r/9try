import { BookOpenText, LogOut, MapPin, Users } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
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

      <Button variant="ghost" onClick={() => void signOut()}><LogOut size={17} /> Đăng xuất</Button>
    </div>
  );
}

function ToolLink({ to, icon, title, body }: { to: string; icon: React.ReactNode; title: string; body: string }) {
  return (
    <Link to={to} className="rounded-[28px] border border-black/8 bg-[var(--surface)] p-5 transition hover:-translate-y-0.5 dark:border-white/8">
      {icon}
      <b className="mt-8 block">{title}</b>
      <p className="mt-1 text-sm leading-5 text-[var(--muted)]">{body}</p>
    </Link>
  );
}

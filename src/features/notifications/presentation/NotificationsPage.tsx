import { Bell, BellOff, Check, Moon, Smartphone } from "lucide-react";
import { useEffect, useState } from "react";
import { useAuth } from "../../../bootstrap/AuthProvider";
import { appData } from "../../../shared/infrastructure/AppData";
import { pushData, type NotificationPreferences } from "../infrastructure/PushData";
import { Button } from "../../../shared/ui/Button";
import { Card } from "../../../shared/ui/Card";

interface NotificationRow {
  id: string;
  title: string;
  body: string;
  read_at: string | null;
  created_at: string;
}

const categories = [
  ["friend_request", "Lời mời kết bạn"],
  ["group_invite", "Lời mời nhóm"],
  ["meetup_invite", "Lời mời hoạt động"],
  ["poll_deadline", "Hạn bình chọn"],
  ["rsvp_update", "Cập nhật tham gia"],
  ["meetup_change", "Thay đổi hoạt động"],
  ["upcoming_event", "Sự kiện sắp tới"],
  ["personal_reminder", "Nhắc việc cá nhân"],
] as const;

export function NotificationsPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<NotificationRow[]>([]);
  const [prefs, setPrefs] = useState<NotificationPreferences>({
    pushEnabled: false,
    quietStart: "",
    quietEnd: "",
    categoryPush: {},
  });
  const [browserSubscribed, setBrowserSubscribed] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function refreshNotifications() {
    if (!user) return;
    const home = await appData.home(user.id);
    setItems(home.notifications as NotificationRow[]);
  }

  async function refreshPreferences() {
    if (!user) return;
    try {
      const [nextPrefs, subscribed] = await Promise.all([
        pushData.preferences(user.id),
        pushData.isSubscribed(),
      ]);
      setPrefs(nextPrefs);
      setBrowserSubscribed(subscribed);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không thể tải cài đặt thông báo.");
    }
  }

  useEffect(() => {
    void refreshNotifications();
    void refreshPreferences();
  }, [user?.id]);

  async function markRead(id: string) {
    await appData.markRead(id);
    await refreshNotifications();
  }

  async function togglePush() {
    if (!user) return;
    setBusy(true);
    setMessage("");
    try {
      if (browserSubscribed || prefs.pushEnabled) {
        await pushData.disable(user.id);
        setMessage("Đã tắt web push trên thiết bị này.");
      } else {
        await pushData.enable(user.id);
        setMessage("Đã bật web push trên thiết bị này.");
      }
      await refreshPreferences();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không thể thay đổi web push.");
    } finally {
      setBusy(false);
    }
  }

  async function savePreferences(next: NotificationPreferences) {
    if (!user) return;
    setPrefs(next);
    try {
      await pushData.savePreferences(user.id, next);
      setMessage("Đã lưu tùy chọn thông báo.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không thể lưu tùy chọn.");
    }
  }

  const pushActive = prefs.pushEnabled && browserSubscribed;

  return (
    <div className="space-y-5">
      <header>
        <p className="text-sm font-semibold text-[var(--muted)]">In-app luôn là bản ghi tin cậy</p>
        <h1 className="mt-1 text-4xl font-black tracking-[-.045em]">Thông báo</h1>
      </header>

      {message && <div className="rounded-2xl bg-[var(--soft)] p-4 text-sm">{message}</div>}

      <Card title="Web push">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <p className="flex items-center gap-2 font-bold">
              {pushActive ? <Bell size={18} /> : <BellOff size={18} />}
              {pushActive ? "Đang bật trên thiết bị này" : "Chưa bật trên thiết bị này"}
            </p>
            <p className="mt-1 max-w-2xl text-sm leading-6 text-[var(--muted)]">
              Push là kênh bổ sung, không đảm bảo đến tức thời. Mọi nhắc việc vẫn được lưu trong trung tâm này.
            </p>
          </div>
          <Button
            variant={pushActive ? "ghost" : "secondary"}
            disabled={busy || !pushData.supported()}
            onClick={() => void togglePush()}
          >
            <Smartphone size={17} /> {pushActive ? "Tắt push" : "Bật push"}
          </Button>
        </div>
        {!pushData.supported() && (
          <p className="mt-3 text-sm text-amber-700">Trình duyệt hiện tại không hỗ trợ Web Push.</p>
        )}
        <p className="mt-3 text-xs leading-5 text-[var(--muted)]">
          Trên một số nền tảng, đặc biệt iPhone/iPad, bạn có thể cần cài website lên Màn hình chính trước khi Web Push hoạt động.
        </p>
      </Card>

      <div className="grid gap-5 lg:grid-cols-2">
        <Card title="Giờ yên tĩnh" action={<Moon size={17} className="text-[var(--muted)]" />}>
          <p className="mb-4 text-sm leading-6 text-[var(--muted)]">
            Trong khoảng này server sẽ không gửi push. Thông báo in-app vẫn được tạo bình thường.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <label>
              <span className="mb-1.5 block text-xs font-bold text-[var(--muted)]">Bắt đầu</span>
              <input
                className="field w-full"
                type="time"
                value={prefs.quietStart}
                onChange={(event) => setPrefs({ ...prefs, quietStart: event.target.value })}
              />
            </label>
            <label>
              <span className="mb-1.5 block text-xs font-bold text-[var(--muted)]">Kết thúc</span>
              <input
                className="field w-full"
                type="time"
                value={prefs.quietEnd}
                onChange={(event) => setPrefs({ ...prefs, quietEnd: event.target.value })}
              />
            </label>
          </div>
          <Button
            className="mt-3"
            variant="ghost"
            onClick={() => void savePreferences(prefs)}
          >
            Lưu giờ yên tĩnh
          </Button>
        </Card>

        <Card title="Push theo loại">
          <div className="space-y-2">
            {categories.map(([key, label]) => {
              const enabled = prefs.categoryPush[key] ?? true;
              return (
                <label key={key} className="flex min-h-11 items-center gap-3 rounded-2xl bg-[var(--soft)] px-3 py-2">
                  <input
                    type="checkbox"
                    checked={enabled}
                    disabled={!prefs.pushEnabled}
                    onChange={(event) => {
                      const next = {
                        ...prefs,
                        categoryPush: { ...prefs.categoryPush, [key]: event.target.checked },
                      };
                      void savePreferences(next);
                    }}
                  />
                  <span className="text-sm font-semibold">{label}</span>
                </label>
              );
            })}
          </div>
        </Card>
      </div>

      <Card title={`Trung tâm thông báo · ${items.filter((item) => !item.read_at).length} chưa đọc`}>
        {items.length ? (
          <div className="divide-y divide-black/8 dark:divide-white/8">
            {items.map((item) => (
              <button
                key={item.id}
                onClick={() => void markRead(item.id)}
                className="flex w-full gap-3 py-4 text-left"
              >
                <span className={`mt-1.5 size-2 shrink-0 rounded-full ${item.read_at ? "bg-black/10 dark:bg-white/10" : "bg-[var(--lime-strong)]"}`} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-start justify-between gap-3">
                    <b>{item.title}</b>
                    <span className="shrink-0 text-xs text-[var(--muted)]">
                      {new Date(item.created_at).toLocaleString("vi-VN")}
                    </span>
                  </span>
                  <span className="mt-1 block text-sm leading-6 text-[var(--muted)]">{item.body}</span>
                </span>
                {item.read_at && <Check size={16} className="mt-1 text-[var(--muted)]" />}
              </button>
            ))}
          </div>
        ) : (
          <div className="py-12 text-center text-[var(--muted)]">
            <Bell className="mx-auto mb-2" />
            Chưa có thông báo mới.
          </div>
        )}
      </Card>
    </div>
  );
}

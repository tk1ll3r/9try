import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { Bell, BellOff, Check, Moon, Smartphone } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { errorMessage } from "../../../kernel/errors";
import { useModule, useRegistry } from "../../../kernel/session";
import { Button } from "../../../kernel/ui/Button";
import { Card } from "../../../kernel/ui/Card";
import { notificationTarget, type AppNotification, type NotificationPreferences } from "../domain/Notification";
import { notificationsModule } from "../notifications.module";
import { unreadKey } from "./UnreadBadge";

const categories = [
  ["chat_message", "Tin nhắn"],
  ["friend_request", "Lời mời kết bạn"],
  ["group_invite", "Lời mời nhóm"],
  ["meetup_invite", "Lời mời hoạt động"],
  ["poll_deadline", "Hạn bình chọn"],
  ["rsvp_update", "Cập nhật tham gia"],
  ["meetup_change", "Thay đổi hoạt động"],
  ["upcoming_event", "Sự kiện sắp tới"],
  ["personal_reminder", "Nhắc việc cá nhân"],
] as const;

const pageSize = 20;
const listKey = ["notifications", "list"] as const;
const pushKey = ["notifications", "push"] as const;
const noPreferences: NotificationPreferences = { pushEnabled: false, quietStart: "", quietEnd: "", categoryPush: {} };

export function NotificationsPage() {
  const { inbox, push } = useModule(notificationsModule);
  const { safePath } = useRegistry();
  const navigate = useNavigate();
  const queries = useQueryClient();
  const [message, setMessage] = useState("");

  const list = useInfiniteQuery({
    queryKey: listKey,
    queryFn: ({ pageParam }) => inbox.list(pageParam, pageSize),
    initialPageParam: 0,
    getNextPageParam: (last, pages) => last.length === pageSize ? pages.length * pageSize : undefined,
  });
  const items = list.data?.pages.flat() ?? [];

  const open = useMutation({
    mutationFn: async (item: AppNotification) => {
      if (!item.readAt) await inbox.markRead(item.id);
      return item;
    },
    onSuccess: item => {
      queries.setQueryData<InfiniteData<AppNotification[]>>(listKey, data => data && {
        ...data,
        pages: data.pages.map(page => page.map(row => row.id === item.id ? { ...row, readAt: row.readAt ?? new Date().toISOString() } : row)),
      });
      void queries.invalidateQueries({ queryKey: unreadKey });
      const target = notificationTarget(item.actionPath, safePath);
      if (target) navigate(target);
    },
  });

  const settings = useQuery({
    queryKey: pushKey,
    queryFn: async () => ({ prefs: await push.preferences(), subscribed: await push.isSubscribed() }),
  });
  // Editable copy: the quiet-hours fields change it before "Lưu giờ yên tĩnh" saves it.
  const [prefs, setPrefs] = useState(noPreferences);
  useEffect(() => { if (settings.data) setPrefs(settings.data.prefs); }, [settings.data]);
  const browserSubscribed = settings.data?.subscribed ?? false;

  const change = useMutation({
    mutationFn: (job: () => Promise<string>) => job(),
    onSuccess: setMessage,
    onError: cause => {
      setMessage(errorMessage(cause, "Không thể lưu thay đổi. Hãy thử lại."));
      if (settings.data) setPrefs(settings.data.prefs);
    },
    onSettled: () => queries.invalidateQueries({ queryKey: pushKey }),
  });
  const busy = change.isPending;

  function togglePush() {
    if (busy) return;
    setMessage("");
    change.mutate(async () => {
      if (browserSubscribed || prefs.pushEnabled) { await push.disable(); return "Đã tắt web push trên thiết bị này."; }
      await push.enable(); return "Đã bật web push trên thiết bị này.";
    });
  }

  function savePreferences(next: NotificationPreferences) {
    if (busy) return;
    setPrefs(next);
    change.mutate(async () => { await push.savePreferences(next); return "Đã lưu tùy chọn thông báo."; });
  }

  const pushActive = prefs.pushEnabled && browserSubscribed;
  const notice = message || (settings.isError ? errorMessage(settings.error, "Không thể tải cài đặt thông báo.") : "");
  const listProblem = open.isError ? errorMessage(open.error, "Không thể mở thông báo.")
    : list.isError ? errorMessage(list.error, "Không thể tải thông báo.") : "";

  return (
    <div className="space-y-5">
      <header>
        <p className="text-sm font-semibold text-[var(--muted)]">In-app luôn là bản ghi tin cậy</p>
        <h1 className="mt-1 text-4xl font-black tracking-[-.045em]">Thông báo</h1>
      </header>

      {notice && <div className="rounded-2xl bg-[var(--soft)] p-4 text-sm">{notice}</div>}

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
            disabled={busy || !push.supported()}
            onClick={togglePush}
          >
            <Smartphone size={17} /> {pushActive ? "Tắt push" : "Bật push"}
          </Button>
        </div>
        {!push.supported() && (
          <p className="mt-3 text-sm text-[var(--warning)]">Trình duyệt hiện tại không hỗ trợ Web Push.</p>
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
          <Button className="mt-3" variant="ghost" disabled={busy} onClick={() => savePreferences(prefs)}>
            Lưu giờ yên tĩnh
          </Button>
        </Card>

        <Card title="Push theo loại">
          <div className="space-y-2">
            {categories.map(([key, label]) => (
              <label key={key} className="flex min-h-11 items-center gap-3 rounded-2xl bg-[var(--soft)] px-3 py-2">
                <input
                  type="checkbox"
                  checked={prefs.categoryPush[key] ?? true}
                  disabled={!prefs.pushEnabled || busy}
                  onChange={(event) => savePreferences({ ...prefs, categoryPush: { ...prefs.categoryPush, [key]: event.target.checked } })}
                />
                <span className="text-sm font-semibold">{label}</span>
              </label>
            ))}
          </div>
        </Card>
      </div>

      <Card title={`Trung tâm thông báo · ${items.filter((item) => !item.readAt).length} chưa đọc`}>
        {listProblem && <p role="alert" className="mb-3 text-sm text-[var(--danger)]">{listProblem} <Button variant="ghost" disabled={list.isFetching}
          onClick={() => void (list.isFetchNextPageError ? list.fetchNextPage() : list.refetch())}>Thử lại</Button></p>}
        {list.isPending && <p role="status">Đang tải thông báo…</p>}
        {items.length ? (
          <div className="divide-y divide-black/8 dark:divide-white/8">
            {items.map((item) => (
              <button
                key={item.id}
                onClick={() => open.mutate(item)}
                disabled={open.isPending}
                aria-label={`${item.title}. ${notificationTarget(item.actionPath, safePath) ? "Mở nội dung" : "Đánh dấu đã đọc"}`}
                className="flex w-full gap-3 py-4 text-left disabled:opacity-60"
              >
                <span className={`mt-1.5 size-2 shrink-0 rounded-full ${item.readAt ? "bg-black/10 dark:bg-white/10" : "bg-[var(--lime-strong)]"}`} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-start justify-between gap-3">
                    <b>{item.title}</b>
                    <span className="shrink-0 text-xs text-[var(--muted)]">
                      {new Date(item.createdAt).toLocaleString("vi-VN")}
                    </span>
                  </span>
                  <span className="mt-1 block text-sm leading-6 text-[var(--muted)]">{item.body}</span>
                </span>
                {item.readAt && <Check size={16} className="mt-1 text-[var(--muted)]" />}
              </button>
            ))}
          </div>
        ) : !list.isPending && !listProblem ? (
          <div className="py-12 text-center text-[var(--muted)]">
            <Bell className="mx-auto mb-2" />
            Chưa có thông báo mới.
          </div>
        ) : null}
        {list.hasNextPage && <Button className="mt-3" variant="ghost" disabled={list.isFetchingNextPage} onClick={() => void list.fetchNextPage()}>{list.isFetchingNextPage ? "Đang tải…" : "Xem thêm"}</Button>}
      </Card>
    </div>
  );
}

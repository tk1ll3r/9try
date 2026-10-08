import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, BellOff } from "lucide-react";
import { useEffect, useState } from "react";
import { errorMessage } from "../../../kernel/errors";
import { useModule } from "../../../kernel/session";
import { Button } from "../../../kernel/ui/Button";
import { Card } from "../../../kernel/ui/Card";
import type { NotificationPreferences } from "../domain/Notification";
import { notificationsModule } from "../notifications.module";
import { t } from "../../../kernel/i18n";

const categories = [
  ["chat_message", t("Tin nhắn")],
  ["friend_request", t("Lời mời kết bạn")],
  ["group_invite", t("Lời mời nhóm")],
  ["meetup_invite", t("Lời mời hoạt động")],
  ["poll_deadline", t("Hạn bình chọn")],
  ["rsvp_update", t("Cập nhật tham gia")],
  ["meetup_change", t("Thay đổi hoạt động")],
  ["upcoming_event", t("Sự kiện sắp tới")],
  ["personal_reminder", t("Nhắc việc cá nhân")],
] as const;

const pushKey = ["notifications", "push"] as const;
const noPreferences: NotificationPreferences = { pushEnabled: false, quietStart: "", quietEnd: "", categoryPush: {} };

/** The settings section for push: on or off on this device, the quiet hours, and which kinds are pushed. */
export function NotificationSettings() {
  const { push } = useModule(notificationsModule);
  const queries = useQueryClient();
  const [message, setMessage] = useState("");
  const settings = useQuery({ queryKey: pushKey, queryFn: async () => ({ prefs: await push.preferences(), subscribed: await push.isSubscribed() }) });
  // An editable copy: the quiet-hours fields change it before "Lưu giờ yên tĩnh" saves it.
  const [prefs, setPrefs] = useState(noPreferences);
  useEffect(() => { if (settings.data) setPrefs(settings.data.prefs); }, [settings.data]);
  const subscribed = settings.data?.subscribed ?? false;
  const active = prefs.pushEnabled && subscribed;

  const change = useMutation({
    mutationFn: (job: () => Promise<string>) => job(),
    onSuccess: setMessage,
    onError: cause => {
      setMessage(errorMessage(cause, t("Chưa lưu được thay đổi. Hãy thử lại.")));
      if (settings.data) setPrefs(settings.data.prefs);
    },
    onSettled: () => queries.invalidateQueries({ queryKey: pushKey }),
  });
  const busy = change.isPending;

  function toggle() {
    if (busy) return;
    setMessage("");
    change.mutate(async () => {
      if (subscribed || prefs.pushEnabled) { await push.disable(); return t("Đã tắt thông báo đẩy trên thiết bị này."); }
      await push.enable(); return t("Đã bật thông báo đẩy trên thiết bị này.");
    });
  }
  function save(next: NotificationPreferences) {
    if (busy) return;
    setPrefs(next);
    change.mutate(async () => { await push.savePreferences(next); return t("Đã lưu tùy chọn thông báo."); });
  }

  // Why push cannot be turned on here, or "" when it can.
  const blocked = !push.supported() ? t("Trình duyệt này không hỗ trợ thông báo đẩy. Trên iPhone và iPad, hãy cài ứng dụng lên Màn hình chính trước.")
    : !push.configured() ? t("Bản ứng dụng này chưa bật thông báo đẩy.") : "";
  const notice = message || (settings.isError ? errorMessage(settings.error, t("Chưa tải được cài đặt thông báo.")) : "");

  return <Card title={t("Thông báo đẩy")} action={active ? <Bell size={18} className="text-[var(--muted)]" /> : <BellOff size={18} className="text-[var(--muted)]" />}>
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="font-bold">{active ? t("Đang bật trên thiết bị này") : t("Chưa bật trên thiết bị này")}</p>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-[var(--muted)]">{t("Thông báo đẩy báo cho bạn khi ứng dụng đang đóng. Nó có thể tới chậm; mọi thông báo vẫn nằm trong mục Thông báo.")}</p>
      </div>
      <Button className="shrink-0" variant={active ? "ghost" : "secondary"} disabled={busy || (!active && !!blocked)} onClick={toggle}>{active ? t("Tắt thông báo đẩy") : t("Bật thông báo đẩy")}</Button>
    </div>
    {blocked && !active && <p className="mt-3 text-sm leading-6 text-[var(--warning)]">{blocked}</p>}
    {notice && <p role="status" className="mt-3 rounded-2xl bg-[var(--soft)] p-3 text-sm">{notice}</p>}

    <div className="mt-5 grid gap-5 border-t border-[var(--border)] pt-5 lg:grid-cols-2">
      <div>
        <p className="font-bold">{t("Giờ yên tĩnh")}</p>
        <p className="mt-1 text-sm leading-6 text-[var(--muted)]">{t("Trong khoảng này không có thông báo đẩy. Thông báo vẫn vào mục Thông báo như thường.")}</p>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <label className="grid gap-1 text-sm font-semibold">{t("Từ")}<input className="field" type="time" value={prefs.quietStart} onChange={event => setPrefs({ ...prefs, quietStart: event.target.value })} /></label>
          <label className="grid gap-1 text-sm font-semibold">{t("Đến")}<input className="field" type="time" value={prefs.quietEnd} onChange={event => setPrefs({ ...prefs, quietEnd: event.target.value })} /></label>
        </div>
        <Button className="mt-3" variant="ghost" disabled={busy} onClick={() => save(prefs)}>{t("Lưu giờ yên tĩnh")}</Button>
      </div>
      <fieldset disabled={!prefs.pushEnabled || busy} className="min-w-0">
        <legend className="font-bold">{t("Loại thông báo được đẩy")}</legend>
        <div className="mt-2 grid gap-1.5 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
          {categories.map(([key, label]) => <label key={key} className="flex min-h-11 items-center gap-3 rounded-2xl bg-[var(--soft)] px-3 text-sm font-semibold">
            <input type="checkbox" className="size-4" checked={prefs.categoryPush[key] ?? true} onChange={event => save({ ...prefs, categoryPush: { ...prefs.categoryPush, [key]: event.target.checked } })} />
            {label}
          </label>)}
        </div>
      </fieldset>
    </div>
  </Card>;
}

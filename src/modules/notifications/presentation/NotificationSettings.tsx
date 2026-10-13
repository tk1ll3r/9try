import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Bell, BellOff, Check, Send, Smartphone, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { errorMessage } from "../../../kernel/errors";
import { isInstalled, isIos } from "../../../kernel/install";
import { useModule } from "../../../kernel/session";
import { Button } from "../../../kernel/ui/Button";
import { Card } from "../../../kernel/ui/Card";
import type { NotificationPreferences } from "../domain/Notification";
import type { PushDevice, TestResult } from "../domain/Push";
import { notificationsModule } from "../notifications.module";
import { locale, t } from "../../../kernel/i18n";

/** The kinds of notification a person can keep from being pushed. One line may stand for several kinds the database writes. */
const categories: [keys: string[], label: string][] = [
  [["chat_message"], t("Tin nhắn")],
  [["moment"], t("Ảnh mới của bạn bè")],
  [["expenses"], t("Sổ chi tiêu")],
  [["friend_request"], t("Lời mời kết bạn")],
  [["meetup_invite"], t("Lời mời hoạt động")],
  [["rsvp_update"], t("Cập nhật tham gia")],
  [["meetup_change"], t("Thay đổi hoạt động")],
  [["upcoming_event"], t("Sắp diễn ra (trước 30 phút)")],
  [["event_shared", "event_changed"], t("Sự kiện bạn bè cho bạn xem")],
  [["schedule_request", "schedule_response"], t("Yêu cầu xem lịch")],
  [["location_request"], t("Hỏi vị trí")],
  [["location_nearby"], t("Bạn bè ở gần")],
  [["personal_reminder"], t("Nhắc việc cá nhân")],
];
/** Off until asked for, unlike the others: it can be many pushes a day. */
const modeAlerts = "friend_mode";

const pushKey = ["notifications", "push"] as const;
const noPreferences: NotificationPreferences = { pushEnabled: false, quietStart: "", quietEnd: "", categoryPush: {}, privatePreviews: false };
const moment = (instant: string) => new Date(instant).toLocaleString(locale, { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" });
const row = "flex min-h-11 items-center gap-3 rounded-2xl bg-[var(--soft)] px-3 text-sm font-semibold";

/**
 * The settings section for push: on or off on this device, what stands in the way, a test, the
 * person's devices, the quiet hours, and which kinds are pushed and how much they say.
 */
export function NotificationSettings() {
  const { push } = useModule(notificationsModule);
  const queries = useQueryClient();
  const [message, setMessage] = useState("");
  const [tested, setTested] = useState<TestResult[] | null>(null);
  const settings = useQuery({ queryKey: pushKey, queryFn: async () => ({ prefs: await push.preferences(), setup: await push.setup(), devices: await push.devices().catch(() => [] as PushDevice[]) }) });
  // An editable copy: the quiet-hours fields change it before "Lưu giờ yên tĩnh" saves it.
  const [prefs, setPrefs] = useState(noPreferences);
  useEffect(() => { if (settings.data) setPrefs(settings.data.prefs); }, [settings.data]);
  const setup = settings.data?.setup;
  const devices = settings.data?.devices ?? [];
  const subscribed = setup?.subscribed ?? false;
  const active = prefs.pushEnabled && subscribed;

  const change = useMutation({
    mutationFn: (job: () => Promise<string>) => job(),
    // The mutation hands its callback more than the text; a state setter takes one value.
    onSuccess: text => setMessage(text),
    onError: cause => {
      setMessage(errorMessage(cause, t("Chưa lưu được thay đổi. Hãy thử lại.")));
      if (settings.data) setPrefs(settings.data.prefs);
    },
    onSettled: () => queries.invalidateQueries({ queryKey: pushKey }),
  });
  const busy = change.isPending;
  const act = (job: () => Promise<string>) => { if (!busy) { setMessage(""); change.mutate(job); } };

  function toggle() {
    if (busy) return;
    // Started here, inside the tap, and not when the mutation gets to it: iPhone and iPad ask for
    // the permission only in direct answer to a tap.
    const done = subscribed ? push.disable().then(() => t("Đã tắt thông báo đẩy trên thiết bị này.")) : push.enable().then(() => t("Đã bật thông báo đẩy trên thiết bị này."));
    done.catch(() => undefined);
    act(() => done);
  }
  function save(next: NotificationPreferences) {
    if (busy) return;
    setPrefs(next);
    act(async () => { await push.savePreferences(next); return t("Đã lưu tùy chọn thông báo."); });
  }
  const test = () => { setTested(null); act(async () => {
    const results = await push.sendTest();
    setTested(results);
    const reached = results.filter(result => result.status >= 200 && result.status < 300).length;
    return !results.length ? t("Chưa có thiết bị nào đăng ký nhận thông báo đẩy.")
      : reached === results.length ? t("Đã gửi tới {0} thiết bị. Thông báo sẽ hiện trong vài giây.", reached)
      : t("Đã gửi tới {0}/{1} thiết bị. Xem thiết bị bị lỗi ở dưới.", reached, results.length);
  }); };

  // What stands between this browser and a push, in the order a person can do something about it.
  const needsInstall = isIos() && !isInstalled();
  const steps: [ok: boolean, text: string][] = setup ? [
    [setup.supported, setup.supported ? t("Trình duyệt này nhận được thông báo đẩy.")
      : needsInstall ? t("Trên iPhone và iPad, thông báo đẩy chỉ tới ứng dụng đã cài: mở trang này bằng Safari, chạm Chia sẻ, chọn “Thêm vào Màn hình chính”, rồi mở Gnouht từ Màn hình chính.")
      : t("Trình duyệt này không hỗ trợ thông báo đẩy.")],
    [setup.configured, setup.configured ? t("Bản ứng dụng này đã sẵn sàng gửi thông báo đẩy.") : t("Bản ứng dụng này chưa bật thông báo đẩy.")],
    [setup.permission === "granted", setup.permission === "granted" ? t("Bạn đã cho phép Gnouht gửi thông báo.")
      : setup.permission === "denied" ? t("Trình duyệt đang chặn thông báo của Gnouht. Mở cài đặt trang web của trình duyệt (biểu tượng ổ khóa cạnh địa chỉ), cho phép Thông báo, rồi tải lại trang.")
      : t("Trình duyệt sẽ hỏi quyền khi bạn bấm “Bật thông báo đẩy”.")],
    [subscribed, subscribed ? t("Thiết bị này đã đăng ký nhận thông báo đẩy.") : t("Thiết bị này chưa đăng ký nhận thông báo đẩy.")],
  ] : [];
  const blocked = !!setup && (!setup.supported || !setup.configured || setup.permission === "denied");
  const notice = message || (settings.isError ? errorMessage(settings.error, t("Chưa tải được cài đặt thông báo.")) : "");
  const answerOf = (device: PushDevice) => tested?.find(result => result.device === device.id);

  return <Card title={t("Thông báo đẩy")} action={active ? <Bell size={18} className="text-[var(--muted)]" /> : <BellOff size={18} className="text-[var(--muted)]" />}>
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <p className="font-bold">{active ? t("Đang bật trên thiết bị này") : t("Chưa bật trên thiết bị này")}</p>
        <p className="mt-1 max-w-2xl text-sm leading-6 text-[var(--muted)]">{t("Thông báo đẩy báo cho bạn khi ứng dụng đang đóng. Nó có thể tới chậm; mọi thông báo vẫn nằm trong mục Thông báo.")}</p>
      </div>
      <Button className="shrink-0" variant={subscribed ? "ghost" : "secondary"} disabled={busy || (!subscribed && blocked)} onClick={toggle}>{subscribed ? t("Tắt thông báo đẩy") : t("Bật thông báo đẩy")}</Button>
    </div>

    <ul aria-label={t("Tình trạng thiết lập")} className="mt-4 grid gap-1.5">
      {steps.map(([ok, text], index) => <li key={index} className="flex items-start gap-2.5 text-sm leading-6">
        <span className={`mt-1 grid size-4 shrink-0 place-items-center rounded-full text-white ${ok ? "bg-emerald-600" : "bg-[var(--muted)]"}`}>{ok ? <Check size={11} strokeWidth={3} /> : <X size={11} strokeWidth={3} />}</span>
        <span className={ok ? "" : "text-[var(--muted)]"}>{text}</span>
      </li>)}
    </ul>
    {notice && <p role="status" className="mt-3 rounded-2xl bg-[var(--soft)] p-3 text-sm">{notice}</p>}

    <div className="mt-5 border-t border-[var(--border)] pt-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="font-bold">{t("Thiết bị nhận thông báo · {0}", devices.length)}</p>
        <Button variant="ghost" disabled={busy || !devices.length} onClick={test}><Send size={16} /> {t("Gửi thông báo thử")}</Button>
      </div>
      {devices.length ? <ul className="mt-2 grid gap-2">{devices.map(device => {
        const answer = answerOf(device);
        const failing = answer ? answer.status < 200 || answer.status >= 300 : !!device.lastError;
        return <li key={device.id} className="flex flex-wrap items-center gap-3 rounded-2xl bg-[var(--soft)] p-3">
          <Smartphone size={18} className="shrink-0 text-[var(--muted)]" />
          <p className="min-w-0 flex-1 text-sm"><b className="block truncate">{device.label}{device.current && <span className="font-normal text-[var(--muted)]"> · {t("thiết bị này")}</span>}</b>
            <span className={`block text-xs ${failing ? "text-[var(--danger)]" : "text-[var(--muted)]"}`}>{
              answer ? (failing ? t("Thông báo thử bị từ chối: {0}", answer.error ?? answer.status) : t("Đã nhận thông báo thử."))
              : device.lastError ? t("Lần gửi gần nhất bị từ chối ({0}), lúc {1}", device.lastError, moment(device.lastFailureAt ?? device.createdAt))
              : device.lastSuccessAt ? t("Gửi được lần gần nhất lúc {0}", moment(device.lastSuccessAt))
              : t("Đăng ký lúc {0}, chưa có thông báo nào được gửi", moment(device.createdAt))}</span></p>
          <Button variant="ghost" className="min-h-9 px-3 py-1.5" disabled={busy} aria-label={t("Gỡ thiết bị {0}", device.label)}
            onClick={() => act(async () => { if (device.current) await push.disable(); else await push.removeDevice(device.id); return t("Đã gỡ thiết bị. Nó sẽ không nhận thông báo đẩy nữa."); })}><Trash2 size={16} /> {t("Gỡ")}</Button>
        </li>;
      })}</ul> : <p className="mt-2 text-sm text-[var(--muted)]">{t("Chưa có thiết bị nào. Bật thông báo đẩy trên từng điện thoại, máy tính bạn muốn nhận.")}</p>}
    </div>

    <div className="mt-5 grid gap-5 border-t border-[var(--border)] pt-5 lg:grid-cols-2">
      <div>
        <p className="font-bold">{t("Giờ yên tĩnh")}</p>
        <p className="mt-1 text-sm leading-6 text-[var(--muted)]">{t("Trong khoảng này không có thông báo đẩy. Thông báo vẫn vào mục Thông báo như thường.")}</p>
        <div className="mt-3 grid grid-cols-2 gap-3">
          <label className="grid gap-1 text-sm font-semibold">{t("Từ")}<input className="field" type="time" value={prefs.quietStart} onChange={event => setPrefs({ ...prefs, quietStart: event.target.value })} /></label>
          <label className="grid gap-1 text-sm font-semibold">{t("Đến")}<input className="field" type="time" value={prefs.quietEnd} onChange={event => setPrefs({ ...prefs, quietEnd: event.target.value })} /></label>
        </div>
        <Button className="mt-3" variant="ghost" disabled={busy} onClick={() => save(prefs)}>{t("Lưu giờ yên tĩnh")}</Button>

        <label className={`${row} mt-5`}>
          <input type="checkbox" className="size-4" disabled={busy} checked={prefs.privatePreviews} onChange={event => save({ ...prefs, privatePreviews: event.target.checked })} />
          {t("Ẩn nội dung trên màn hình khóa")}
        </label>
        <p className="mt-1 text-xs leading-5 text-[var(--muted)]">{t("Thông báo đẩy khi đó chỉ báo “Bạn có thông báo mới”, không kèm tên người hay nội dung. Mở ứng dụng để xem.")}</p>
      </div>
      <fieldset disabled={!prefs.pushEnabled || busy} className="min-w-0">
        <legend className="font-bold">{t("Loại thông báo được đẩy")}</legend>
        <div className="mt-2 grid gap-1.5 sm:grid-cols-2 lg:grid-cols-1 xl:grid-cols-2">
          {categories.map(([keys, label]) => <label key={keys[0]} className={row}>
            <input type="checkbox" className="size-4" checked={prefs.categoryPush[keys[0]] ?? true}
              onChange={event => save({ ...prefs, categoryPush: { ...prefs.categoryPush, ...Object.fromEntries(keys.map(key => [key, event.target.checked])) } })} />
            {label}
          </label>)}
        </div>
      </fieldset>
    </div>

    {/* Not a push setting only: it also decides whether the alert is written into the inbox at all. */}
    <div className="mt-5 border-t border-[var(--border)] pt-5">
      <label className={row}>
        <input type="checkbox" className="size-4" disabled={busy} checked={prefs.categoryPush[modeAlerts] ?? false} onChange={event => save({ ...prefs, categoryPush: { ...prefs.categoryPush, [modeAlerts]: event.target.checked } })} />
        {t("Báo khi người bạn đã ghim bật mode")}
      </label>
      <p className="mt-1 text-xs leading-5 text-[var(--muted)]">{t("Chỉ với những người bạn bạn đã ghim (dấu sao ở màn Mode). Nhiều lần đổi mode liền nhau được gộp thành một thông báo.")}</p>
    </div>
  </Card>;
}

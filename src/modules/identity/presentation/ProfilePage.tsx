import { useQuery } from "@tanstack/react-query";
import { CalendarDays, Camera, ChevronRight, Radio, Trash2, Undo2 } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../../kernel/auth";
import { errorMessage } from "../../../kernel/errors";
import { useModule, useUserId } from "../../../kernel/session";
import { useAction } from "../../../kernel/useAction";
import { Avatar } from "../../../kernel/ui/Avatar";
import { Button } from "../../../kernel/ui/Button";
import { Card } from "../../../kernel/ui/Card";
import { birthdayText, Profile, usernamePattern, type FieldAudience, type ProfileFields } from "../domain/Profile";
import { identityModule } from "../identity.module";
import { AvatarEditor } from "./AvatarEditor";
import { profileKey, useProfile } from "./useProfile";
import { useMomentStreaks } from "../../moments";
import { t } from "../../../kernel/i18n";

const deviceZone = Intl.DateTimeFormat().resolvedOptions().timeZone;
const zones = typeof Intl.supportedValuesOf === "function" ? Intl.supportedValuesOf("timeZone") : [deviceZone];
const empty: ProfileFields = { displayName: "", username: "", bio: "", timezone: deviceZone, birthday: "", avatarUrl: "", bioAudience: "friends", birthdayAudience: "private" };
const fieldsOf = (profile: Profile): ProfileFields => ({
  displayName: profile.displayName, username: profile.username, bio: profile.bio, timezone: profile.timezone, birthday: profile.birthday,
  avatarUrl: profile.avatarUrl, bioAudience: profile.bioAudience, birthdayAudience: profile.birthdayAudience,
});
const bioLimit = 500;

/**
 * The person's own profile: what friends see of them at the top, the form under it. The form says
 * whether it holds changes that are not saved yet, and it is filled from the server once, so a
 * reload in the background cannot undo what is being typed.
 */
export function ProfilePage() {
  const profiles = useModule(identityModule);
  const profile = useProfile();
  const userId = useUserId();
  const streaks = useMomentStreaks();
  const streak = streaks.get(userId) ?? 0;
  const { run, pending, error } = useAction(profileKey);
  const [saved, setSaved] = useState<ProfileFields | null>(null);
  const [value, setValue] = useState(empty);
  const [message, setMessage] = useState("");
  const [photo, setPhoto] = useState<File | null>(null);
  // An account made with Google has a name there already. It is offered in the form and kept only when the form is saved.
  const givenName = useAuth().user?.user_metadata?.full_name;
  const offeredName = typeof givenName === "string" ? givenName.trim().slice(0, 80) : "";
  useEffect(() => {
    if (!profile.data || saved) return;
    const stored = fieldsOf(profile.data);
    setSaved(stored);
    setValue({ ...stored, displayName: stored.displayName || offeredName });
  }, [profile.data, saved, offeredName]);

  const set = (change: Partial<ProfileFields>) => { setMessage(""); setValue(current => ({ ...current, ...change })); };
  const dirty = !!saved && JSON.stringify(value) !== JSON.stringify(saved);

  // Whether the username is free is asked a moment after the last keystroke.
  const typed = value.username.trim().toLowerCase();
  const [asked, setAsked] = useState("");
  useEffect(() => { const timer = window.setTimeout(() => setAsked(typed), 400); return () => window.clearTimeout(timer); }, [typed]);
  const wellFormed = usernamePattern.test(typed);
  const isOwn = typed === saved?.username;
  const free = useQuery({ queryKey: [...profileKey, "username", asked], queryFn: () => profiles.usernameAvailable(asked), enabled: !!saved && asked === typed && wellFormed && !isOwn, staleTime: 30_000 });
  const taken = !isOwn && wellFormed && asked === typed && free.data === false;
  const usernameNote: [text: string, tone: string] = !typed ? [t("Bạn bè tìm bạn bằng username này. 3–20 ký tự: chữ thường không dấu, số, gạch dưới."), "text-[var(--muted)]"]
    : !wellFormed ? [t("Username gồm 3–20 ký tự: chữ thường không dấu, số hoặc dấu gạch dưới."), "text-[var(--danger)]"]
    : isOwn ? [t("Đây là username hiện tại của bạn."), "text-[var(--muted)]"]
    : taken ? [t("Username này đã có người dùng. Hãy chọn username khác."), "text-[var(--danger)]"]
    : free.data === true && asked === typed ? [t("Username này dùng được."), "text-[var(--success)]"]
    // A server that cannot answer says nothing here; saving still refuses a username that is taken.
    : free.isError ? ["", ""] : [t("Đang kiểm tra username…"), "text-[var(--muted)]"];

  function save(event: FormEvent) {
    event.preventDefault();
    setMessage("");
    run(async () => { const checked = Profile.check(value); await profiles.save(checked); return checked; }, checked => {
      setSaved(fieldsOf(checked));
      setValue(fieldsOf(checked));
      setMessage(t("Đã lưu hồ sơ."));
    });
  }

  const problem = error || (profile.isError ? errorMessage(profile.error, t("Không thể tải hồ sơ.")) : "");
  const name = value.displayName.trim();
  return (
    <div className="space-y-5">
      <header>
        <p className="text-sm font-semibold text-[var(--muted)]">{t("Bạn bè thấy bạn như thế này")}</p>
        <h1 className="mt-1 text-4xl font-black tracking-[-.045em]">{t("Hồ sơ")}</h1>
      </header>

      {problem && <div role="alert" className="rounded-2xl bg-[var(--soft)] p-4 text-sm text-[var(--danger)]">{problem}{profile.isError && <> <Button variant="ghost" disabled={profile.isFetching} onClick={() => void profile.refetch()}>{t("Thử tải lại")}</Button></>}</div>}
      {profile.isPending && <div role="status" aria-label={t("Đang tải hồ sơ")} className="space-y-5"><div className="skeleton h-36" /><div className="skeleton h-80" /></div>}

      {saved && <>
        <Card>
          <div className="flex items-center gap-4">
            <Avatar name={name || "?"} src={value.avatarUrl} className="size-24 shrink-0 bg-[var(--lime)] text-4xl font-black text-[var(--ink)]" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-2xl font-black tracking-tight">{name || t("Chưa có tên")}</p>
              <p className="truncate text-sm text-[var(--muted)]">{typed ? `@${typed}` : t("Chưa có username")}</p>
              {streak >= 3 && <p className="mt-1 inline-flex rounded-full bg-[var(--lime)] px-2.5 py-1 text-xs font-bold text-[var(--ink)]">🔥 {t("Chuỗi đăng tin {0} ngày", streak)}</p>}
              {value.bio.trim() && value.bioAudience === "friends" && <p className="mt-1 line-clamp-3 whitespace-pre-wrap break-words text-sm leading-6">{value.bio.trim()}</p>}
              {value.birthday && value.birthdayAudience === "friends" && <p className="mt-1 text-sm text-[var(--muted)]">{t("Sinh nhật {0}", birthdayText(value.birthday))}</p>}
            </div>
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <label className="pressable inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-2xl bg-[var(--lime)] px-4 text-sm font-semibold text-[var(--ink)] focus-within:ring-2 focus-within:ring-[var(--focus)]">
              <Camera size={17} /> {value.avatarUrl ? t("Đổi ảnh") : t("Thêm ảnh")}
              {/* The same photo can be chosen again after a change of mind, so the field is emptied each time. */}
              <input type="file" accept="image/*" className="sr-only" onChange={event => { setPhoto(event.target.files?.[0] ?? null); event.target.value = ""; }} />
            </label>
            {value.avatarUrl && <Button variant="ghost" onClick={() => set({ avatarUrl: "" })}><Trash2 size={17} /> {t("Gỡ ảnh")}</Button>}
          </div>
        </Card>
        {photo && <AvatarEditor file={photo} onCancel={() => setPhoto(null)} onDone={avatarUrl => { set({ avatarUrl }); setPhoto(null); }} />}

        <Card>
          <form onSubmit={save} className="grid gap-4 md:grid-cols-2" aria-busy={pending}>
            <label className="grid content-start gap-1 text-sm font-semibold">{t("Tên hiển thị")}
              <input className="field" required maxLength={80} value={value.displayName} onChange={event => set({ displayName: event.target.value })} placeholder={t("Tên bạn bè sẽ thấy")} />
            </label>
            <label className="grid content-start gap-1 text-sm font-semibold">Username
              <input className="field" maxLength={20} autoCapitalize="none" autoCorrect="off" spellCheck={false} value={value.username} onChange={event => set({ username: event.target.value })} placeholder="vi_du_123" aria-describedby="username-help" aria-invalid={taken || (!!typed && !wellFormed)} />
              <span id="username-help" role="status" className={`text-xs font-normal ${usernameNote[1]}`}>{usernameNote[0]}</span>
            </label>
            <div className="grid gap-1 md:col-span-2">
              <label className="grid gap-1 text-sm font-semibold">{t("Giới thiệu ngắn")}
                <textarea className="field min-h-24" maxLength={bioLimit} value={value.bio} onChange={event => set({ bio: event.target.value })} placeholder={t("Vài dòng về bạn: học gì, thích gì, hay rảnh lúc nào.")} aria-describedby="bio-count" />
              </label>
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--muted)]">
                <label className="flex items-center gap-2">{t("Ai thấy phần giới thiệu?")}
                  <select className="field min-h-9 py-1 text-xs" value={value.bioAudience} onChange={event => set({ bioAudience: event.target.value as FieldAudience })}>
                    <option value="friends">{t("Bạn bè")}</option><option value="private">{t("Chỉ mình tôi")}</option>
                  </select>
                </label>
                <span id="bio-count" className="tabular-nums">{value.bio.length}/{bioLimit}</span>
              </div>
            </div>
            <label className="grid content-start gap-1 text-sm font-semibold">{t("Múi giờ")}
              <select className="field" value={value.timezone} onChange={event => set({ timezone: event.target.value })}>
                {!zones.includes(value.timezone) && <option value={value.timezone}>{value.timezone}</option>}
                {zones.map(zone => <option key={zone} value={zone}>{zone}</option>)}
              </select>
              {value.timezone !== deviceZone && <span className="text-xs font-normal text-[var(--muted)]">{t("Thiết bị này đang ở múi giờ")} {deviceZone}. <button type="button" className="underline" onClick={() => set({ timezone: deviceZone })}>{t("Dùng múi giờ này")}</button></span>}
            </label>
            <div className="grid content-start gap-1">
              <label className="grid gap-1 text-sm font-semibold">{t("Ngày sinh (tùy chọn)")}
                <input className="field" type="date" value={value.birthday} onChange={event => set({ birthday: event.target.value })} />
              </label>
              <label className="flex items-center gap-2 text-xs text-[var(--muted)]">{t("Ai thấy ngày sinh?")}
                <select className="field min-h-9 py-1 text-xs" value={value.birthdayAudience} onChange={event => set({ birthdayAudience: event.target.value as FieldAudience })}>
                  <option value="private">{t("Chỉ mình tôi")}</option><option value="friends">{t("Bạn bè (ngày và tháng)")}</option>
                </select>
              </label>
            </div>
            <div className="flex flex-wrap items-center gap-3 md:col-span-2">
              <Button type="submit" disabled={pending || !dirty || taken}>{pending ? t("Đang lưu…") : t("Lưu hồ sơ")}</Button>
              {dirty && !pending && <Button variant="ghost" onClick={() => { setMessage(""); setValue(saved); }}><Undo2 size={17} /> {t("Bỏ thay đổi")}</Button>}
              <p role="status" className={`text-sm ${dirty ? "font-semibold text-[var(--warning)]" : "text-[var(--muted)]"}`}>{pending ? t("Đang lưu…") : dirty ? t("Có thay đổi chưa lưu.") : message || t("Mọi thay đổi đã được lưu.")}</p>
            </div>
          </form>
        </Card>

        <Card title={t("Bạn chia sẻ gì với bạn bè")}>
          <ul className="grid gap-2 sm:grid-cols-2">
            <li><Link to="/me/privacy" className="pressable flex min-h-14 items-center gap-3 rounded-2xl bg-[var(--soft)] px-3 text-sm font-semibold"><Radio size={18} className="shrink-0" /> <span className="min-w-0 flex-1">{t("Trạng thái mở ứng dụng")}</span><ChevronRight size={17} className="shrink-0 text-[var(--muted)]" /></Link></li>
            <li><Link to="/calendar/requests" className="pressable flex min-h-14 items-center gap-3 rounded-2xl bg-[var(--soft)] px-3 text-sm font-semibold"><CalendarDays size={18} className="shrink-0" /> <span className="min-w-0 flex-1">{t("Chia sẻ lịch")}</span><ChevronRight size={17} className="shrink-0 text-[var(--muted)]" /></Link></li>
          </ul>
        </Card>
      </>}
    </div>
  );
}

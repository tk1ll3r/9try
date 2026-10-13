import { Download, LogOut } from "lucide-react";
import { useSyncExternalStore } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../../kernel/auth";
import { installOffer } from "../../../kernel/install";
import { warmHandlers, type NavContribution } from "../../../kernel/module";
import { useRegistry } from "../../../kernel/session";
import { Avatar } from "../../../kernel/ui/Avatar";
import { LanguageSwitch } from "../../../kernel/ui/LanguageSwitch";
import { menuRows, Popover } from "../../../kernel/ui/MoreMenu";
import { ThemeSwitch } from "../../../kernel/ui/ThemeSwitch";
import { useProfile } from "./useProfile";
import { t } from "../../../kernel/i18n";

/**
 * The person's own corner of the app, behind their initial at the top right: who is signed in, the
 * screens about them (`items`), the look of the app, and the way out. `active` marks it while one of
 * those screens is open.
 */
export function AccountMenu({ items, active }: { items: readonly NavContribution[]; active: boolean }) {
  const auth = useAuth();
  const { routes } = useRegistry();
  const profile = useProfile();
  const installable = useSyncExternalStore(installOffer.subscribe, installOffer.available);
  const email = auth.user?.email ?? "";
  // Before the profile has a name: the one the account came with, then the part of the email before "@".
  const given = auth.user?.user_metadata?.full_name;
  const name = profile.data?.displayName || (typeof given === "string" && given.trim()) || email.split("@")[0] || t("Bạn");
  const initial = <Avatar name={name} src={profile.data?.avatarUrl} className="size-full bg-[var(--lime)] font-black text-[var(--ink)]" />;

  return <Popover label={t("Tài khoản và cài đặt")} trigger={initial} panelClassName="w-72 max-w-[calc(100vw-2rem)]"
    triggerClassName={`block size-11 rounded-full ${active ? "ring-2 ring-[var(--ink)] ring-offset-2 ring-offset-[var(--paper)]" : ""}`}>
    <div className="flex items-center gap-3 px-2.5 py-2">
      <span className="size-11 shrink-0 text-lg">{initial}</span>
      <p className="min-w-0 leading-tight"><b className="block truncate">{name}</b>
        <span className="block truncate text-xs text-[var(--muted)]">{profile.data?.username ? `@${profile.data.username}` : email}</span></p>
    </div>
    <nav aria-label={t("Tài khoản")} className={`${menuRows} mt-1 border-t border-[var(--border)] pt-1.5`}>
      {items.map(item => <Link key={item.to} to={item.to} {...warmHandlers(routes, item.to)}><item.icon size={18} /> {item.label}</Link>)}
    </nav>
    {/* Trying the looks one after the other should not close the menu. */}
    <div onClick={event => event.stopPropagation()} className="mt-1.5 border-t border-[var(--border)] px-1.5 py-2.5">
      <p className="mb-1.5 px-1 text-xs font-bold text-[var(--muted)]">{t("Giao diện")}</p>
      <ThemeSwitch />
      <p className="mb-1.5 mt-3 px-1 text-xs font-bold text-[var(--muted)]">{t("Ngôn ngữ")}</p>
      <LanguageSwitch label={t("Ngôn ngữ")} />
    </div>
    <div className={`${menuRows} border-t border-[var(--border)] pt-1.5`}>
      {installable && <button type="button" onClick={() => void installOffer.accept()}><Download size={18} /> {t("Cài ứng dụng")}</button>}
      <button type="button" onClick={() => void auth.signOut()}><LogOut size={18} /> {t("Đăng xuất")}</button>
    </div>
  </Popover>;
}

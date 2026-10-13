import { LockKeyhole, MapPin } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../../kernel/auth";
import { isInstalled } from "../../../kernel/install";
import { Button } from "../../../kernel/ui/Button";
import { LanguageSwitch } from "../../../kernel/ui/LanguageSwitch";
import { loginError, loginRedirect, returnPathKey } from "../domain/login";
import { t } from "../../../kernel/i18n";

/** Google's "G", in the colors its sign-in button rules ask for. */
const GoogleMark = () => <svg viewBox="0 0 48 48" width="18" height="18" aria-hidden="true">
  <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
  <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
  <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
  <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
</svg>;

/** `returnPath` is a plain in-app path to open after sign-in. */
export function AuthPage({ returnPath }: { returnPath: string }) {
  const auth = useAuth();
  const [error, setError] = useState("");
  const mounted = useRef(true);

  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  /** Where the browser comes back to after sign-in. The same tab also remembers the path. */
  function comeBackTo(): string {
    try { sessionStorage.setItem(returnPathKey, returnPath); } catch { /* Storage may be disabled; the address still carries the safe route. */ }
    return loginRedirect(location.origin, returnPath);
  }

  // Google takes over the browser immediately; the app handles its return and opens the saved route.
  function continueWithGoogle() {
    setError("");
    void auth.signInWithGoogle(comeBackTo()).then(failure => { if (failure && mounted.current) setError(loginError(failure)); });
  }

  return <main className="grid min-h-dvh bg-[var(--paper)] p-5 text-[var(--ink)] lg:grid-cols-[1.1fr_.9fr]">
    <section className="relative hidden overflow-hidden rounded-[36px] bg-[#24151f] p-12 text-[#fff3f8] lg:flex lg:flex-col">
      <div className="aurora !absolute opacity-60" aria-hidden><i /><i /><i /></div>
      <p className="animate-rise relative font-bold text-[#f7bdd7]">GNOUHT TOGETHER</p>
      <h1 className="animate-rise relative my-auto max-w-xl [animation-delay:120ms] text-6xl font-black leading-[.94] tracking-[-.055em]">{t("Ít nhắn “khi nào rảnh?” hơn. Gặp nhau nhiều hơn.")}</h1>
      <p className="flex gap-2 text-sm text-white/70"><LockKeyhole size={17} /> {t("Riêng tư mặc định. Chia sẻ khi bạn chủ động chọn.")}</p>
    </section>
    <section className="animate-rise mx-auto flex w-full max-w-md flex-col justify-center py-10 [animation-delay:200ms] lg:px-10">
      <p className="mb-6 text-sm font-bold lg:hidden">GNOUHT TOGETHER</p>
      {!isInstalled() && !auth.failed && <Link to={returnPath} className="mb-4 inline-flex min-h-11 items-center self-start text-sm font-semibold text-[var(--muted)] underline">{t("Ứng dụng này làm gì?")}</Link>}
      <span className="mb-4 grid size-12 place-items-center rounded-2xl bg-white"><GoogleMark /></span>
      <h2 className="text-4xl font-black tracking-[-.04em]">{t("Chào bạn.")}</h2>
      <p className="mt-3 leading-6 text-[var(--muted)]">{t("Đăng nhập và tạo tài khoản bằng Google.")}</p>
      {auth.failed && !error && <p role="alert" className="mt-6 rounded-2xl bg-[var(--soft)] p-4 text-sm leading-6 text-[var(--danger)]">{t("Lần đăng nhập Google vừa rồi chưa xong. Bạn thử lại nhé.")}</p>}
      {!auth.configured
        ? <div role="alert" className="mt-8 rounded-3xl bg-amber-100 p-5 text-sm text-amber-950">{t("Supabase chưa cấu hình. Thêm URL và publishable key vào")} <code>.env.local</code>.</div>
        : <>
          <Button variant="white" className="mt-6 min-h-12 w-full" onClick={continueWithGoogle}><GoogleMark /> {t("Tiếp tục với Google")}</Button>
          {error && <p role="alert" className="mt-4 text-sm leading-6 text-[var(--danger)]">{error}</p>}
          <p className="mt-3 text-xs leading-5 text-[var(--muted)]">{t("Google chỉ báo cho ứng dụng tên, email và ảnh đại diện của bạn.")}</p>
        </>}
      {(import.meta.env.DEV || import.meta.env.VITE_ENABLE_DEMO === "true") && <Link className="mt-5 flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-[var(--border)] px-4 py-3 text-sm font-semibold hover:bg-[var(--soft)]" to="/demo/location"><MapPin size={18} /> {t("Xem bản đồ thử với An & Bình")}</Link>}
      <div className="mt-6 w-48 self-center"><LanguageSwitch label={t("Ngôn ngữ")} /></div>
    </section>
  </main>;
}

import { ArrowRight, LockKeyhole, Mail, MapPin } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../../kernel/auth";
import { Button } from "../../../kernel/ui/Button";
import { LanguageSwitch } from "../../../kernel/ui/LanguageSwitch";
import { isLocalBackend, loginError, loginRedirect, returnPathKey } from "../domain/login";
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
  const [email, setEmail] = useState("");
  const [acceptedEmail, setAcceptedEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const [cooldownUntil, setCooldownUntil] = useState(0);
  const [code, setCode] = useState("");
  const [verifying, setVerifying] = useState(false);
  const [codeError, setCodeError] = useState("");
  const [now, setNow] = useState(Date.now());
  const lock = useRef(false);
  const mounted = useRef(true);
  const remaining = Math.max(0, Math.ceil((cooldownUntil - now) / 1000));
  const local = isLocalBackend(import.meta.env.VITE_SUPABASE_URL);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  useEffect(() => {
    if (!cooldownUntil) return;
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, [cooldownUntil]);
  /** Where the browser comes back to after sign-in. The same tab also remembers the path. */
  function comeBackTo(): string {
    try { sessionStorage.setItem(returnPathKey, returnPath); } catch { /* Storage may be disabled; the address still carries the safe route. */ }
    return loginRedirect(location.origin, returnPath);
  }
  // The browser leaves for Google at once, so there is no waiting state to get stuck in if the visitor comes back.
  function continueWithGoogle() {
    setError("");
    void auth.signInWithGoogle(comeBackTo()).then(failure => { if (failure && mounted.current) setError(loginError(failure)); });
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (lock.current || Date.now() < cooldownUntil) return;
    const normalized = email.trim();
    if (!normalized) return;
    lock.current = true; setPending(true); setError("");
    try {
      const authError = await auth.sendSignIn(normalized, comeBackTo());
      if (!mounted.current) return;
      if (authError) {
        setError(loginError(authError));
        if (authError.status === 429) { setCooldownUntil(Date.now() + 60_000); setNow(Date.now()); }
      } else {
        setAcceptedEmail(normalized); setCooldownUntil(Date.now() + 60_000); setNow(Date.now());
      }
    } catch (cause) { if (mounted.current) setError(loginError(cause)); }
    finally { lock.current = false; if (mounted.current) setPending(false); }
  }
  // The code works inside an installed app, where the emailed link would open the browser instead.
  async function verify(event: FormEvent) {
    event.preventDefault();
    if (verifying) return;
    setVerifying(true); setCodeError("");
    try {
      const signedIn = await auth.verifyCode(acceptedEmail, code);
      if (!signedIn && mounted.current) setCodeError(t("Mã không đúng hoặc đã hết hạn. Kiểm tra lại mã, hoặc gửi lại liên kết."));
    } catch { if (mounted.current) setCodeError(t("Chưa kiểm tra được mã. Kiểm tra kết nối rồi thử lại.")); }
    finally { if (mounted.current) setVerifying(false); }
  }
  return <main className="grid min-h-dvh bg-[var(--paper)] p-5 text-[var(--ink)] lg:grid-cols-[1.1fr_.9fr]">
    <section className="relative hidden overflow-hidden rounded-[36px] bg-[#171a12] p-12 text-[#f4f1e8] lg:flex lg:flex-col">
      <div className="aurora !absolute opacity-60" aria-hidden><i /><i /><i /></div>
      <p className="animate-rise relative font-bold text-[#d9ff79]">GNOUHT TOGETHER</p>
      <h1 className="animate-rise relative my-auto max-w-xl [animation-delay:120ms] text-6xl font-black leading-[.94] tracking-[-.055em]">{t("Ít nhắn “khi nào rảnh?” hơn. Gặp nhau nhiều hơn.")}</h1>
      <p className="flex gap-2 text-sm text-white/70"><LockKeyhole size={17} /> {t("Riêng tư mặc định. Chia sẻ khi bạn chủ động chọn.")}</p>
    </section>
    <section className="animate-rise mx-auto flex w-full max-w-md flex-col justify-center py-10 [animation-delay:200ms] lg:px-10">
      <p className="mb-6 text-sm font-bold lg:hidden">GNOUHT TOGETHER</p>
      <span className="mb-4 grid size-12 place-items-center rounded-2xl bg-[var(--lime)] text-[#1d230e]"><Mail size={24} /></span>
      <h2 className="text-4xl font-black tracking-[-.04em]">{t("Chào bạn.")}</h2>
      <p className="mt-3 leading-6 text-[var(--muted)]">{auth.google ? t("Đăng nhập bằng Google, hoặc bằng liên kết và mã gửi qua email. Không cần nhớ mật khẩu.") : t("Đăng nhập bằng liên kết hoặc mã gửi qua email, không cần nhớ mật khẩu.")}</p>
      {auth.failed && !error && !acceptedEmail && <p role="alert" className="mt-6 rounded-2xl bg-[var(--soft)] p-4 text-sm leading-6 text-[var(--danger)]">{auth.failed === "link"
        ? t("Chưa đăng nhập được bằng liên kết này. Có thể nó đã hết hạn hoặc đã được dùng. Nhập email để nhận thư mới.")
        : t("Lần đăng nhập vừa rồi chưa xong. Bạn thử lại nhé.")}</p>}
      {auth.configured && auth.google && <>
        <Button variant="white" className="mt-6 min-h-12 w-full" onClick={continueWithGoogle}><GoogleMark /> {t("Tiếp tục với Google")}</Button>
        <p className="mt-2 text-xs leading-5 text-[var(--muted)]">{t("Google chỉ báo cho ứng dụng tên, email và ảnh đại diện của bạn.")}</p>
        <p className="mt-5 flex items-center gap-3 text-xs font-semibold text-[var(--muted)] before:h-px before:flex-1 before:bg-[var(--border)] after:h-px after:flex-1 after:bg-[var(--border)]">{t("hoặc dùng email")}</p>
      </>}
      {!auth.configured ? <div role="alert" className="mt-8 rounded-3xl bg-amber-100 p-5 text-sm text-amber-950">{t("Supabase chưa cấu hình. Thêm URL và publishable key vào")} <code>.env.local</code>.</div>
        : <form onSubmit={submit} className="mt-6 space-y-4" aria-busy={pending}>
          <label className="block text-sm font-semibold" htmlFor="login-email">{t("Email của bạn")}</label>
          <input id="login-email" className="field w-full" type="email" autoComplete="email" inputMode="email" required disabled={pending} value={email} onChange={event => setEmail(event.target.value)} placeholder="ban@gmail.com" aria-describedby="email-help" />
          {error && <p role="alert" className="text-sm leading-6 text-[var(--danger)]">{error}</p>}
          {acceptedEmail && <div role="status" className="rounded-2xl bg-[var(--lime)] p-4 text-sm leading-6 text-[#1d230e]"><b>{t("Đã gửi thư tới {0}.", acceptedEmail)}</b><p>{t("Mở thư để lấy mã 6 số hoặc bấm liên kết đăng nhập. Chưa thấy thì xem mục Spam.")}</p></div>}
          <Button className="w-full" type="submit" disabled={pending || remaining > 0}>{pending ? t("Đang gửi yêu cầu…") : remaining > 0 ? t("Có thể gửi lại sau {0}s", remaining) : acceptedEmail ? t("Gửi lại liên kết") : t("Gửi liên kết")}<ArrowRight size={17} /></Button>
          <p id="email-help" className="text-xs leading-5 text-[var(--muted)]">{t("Bạn sẽ nhận một thư có liên kết và mã đăng nhập.")}</p>
        </form>}
      {acceptedEmail && <form onSubmit={verify} className="mt-5 space-y-3" aria-busy={verifying}>
        <label className="block text-sm font-semibold" htmlFor="login-code">{t("Mã 6 số trong email (nếu có)")}</label>
        <input id="login-code" className="field w-full tracking-[.4em]" inputMode="numeric" autoComplete="one-time-code" maxLength={6} required value={code} onChange={event => setCode(event.target.value.replace(/\D/g, ""))} placeholder="000000" />
        {codeError && <p role="alert" className="text-sm leading-6 text-[var(--danger)]">{codeError}</p>}
        <Button className="w-full" type="submit" variant="secondary" disabled={verifying || code.length !== 6}>{verifying ? t("Đang kiểm tra…") : t("Đăng nhập bằng mã")}</Button>
      </form>}
      <details className="mt-5 rounded-2xl border border-[var(--border)] p-4 text-sm">
        <summary className="min-h-6 cursor-pointer font-semibold">{t("Không nhận được thư?")}</summary>
        <p className="mt-3 leading-6 text-[var(--muted)]">{local ? t("Bạn đang dùng Supabase local. Email thử nghiệm vào Mailpit, không được gửi tới Gmail.") : t("Xem lại địa chỉ email, rồi tìm trong mục Spam và Tất cả thư. Thư thường tới trong một phút. Hết thời gian chờ, bạn bấm gửi lại được.")}</p>
        {local && <a className="mt-2 inline-block min-h-11 py-2 font-semibold underline" href="http://127.0.0.1:55324" target="_blank" rel="noreferrer">{t("Mở Mailpit (máy chạy Supabase local)")}</a>}
      </details>
      {(import.meta.env.DEV || import.meta.env.VITE_ENABLE_DEMO === "true") && <Link className="mt-5 flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-[var(--border)] px-4 py-3 text-sm font-semibold hover:bg-[var(--soft)]" to="/demo/location"><MapPin size={18} /> {t("Xem bản đồ thử với An & Bình")}</Link>}
      {/* Someone who cannot read the screen has to be able to change its language before signing in. */}
      <div className="mt-6 w-48 self-center"><LanguageSwitch label={t("Ngôn ngữ")} /></div>
    </section>
  </main>;
}

import { ArrowRight, LockKeyhole, Mail, MapPin } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../../../kernel/auth";
import { Button } from "../../../kernel/ui/Button";
import { isLocalBackend, loginError, loginRedirect, returnPathKey } from "../domain/login";

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
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (lock.current || Date.now() < cooldownUntil) return;
    const normalized = email.trim();
    if (!normalized) return;
    lock.current = true; setPending(true); setError("");
    try {
      const path = returnPath;
      try { sessionStorage.setItem(returnPathKey, path); } catch { /* Storage may be disabled; redirect still carries the safe route. */ }
      const authError = await auth.sendSignIn(normalized, loginRedirect(location.origin, path));
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
      if (!signedIn && mounted.current) setCodeError("Mã không đúng hoặc đã hết hạn. Kiểm tra lại mã, hoặc gửi lại liên kết.");
    } catch { if (mounted.current) setCodeError("Chưa kiểm tra được mã. Kiểm tra kết nối rồi thử lại."); }
    finally { if (mounted.current) setVerifying(false); }
  }
  return <main className="grid min-h-dvh bg-[var(--paper)] p-5 text-[var(--ink)] lg:grid-cols-[1.1fr_.9fr]">
    <section className="relative hidden overflow-hidden rounded-[36px] bg-[#171a12] p-12 text-[#f4f1e8] lg:flex lg:flex-col">
      <div className="aurora !absolute opacity-60" aria-hidden><i /><i /><i /></div>
      <p className="animate-rise relative font-bold text-[#d9ff79]">GNOUHT TOGETHER</p>
      <h1 className="animate-rise relative my-auto max-w-xl [animation-delay:120ms] text-6xl font-black leading-[.94] tracking-[-.055em]">Ít nhắn “khi nào rảnh?” hơn. Gặp nhau nhiều hơn.</h1>
      <p className="flex gap-2 text-sm text-white/70"><LockKeyhole size={17} /> Riêng tư mặc định. Chia sẻ khi bạn chủ động chọn.</p>
    </section>
    <section className="animate-rise mx-auto flex w-full max-w-md flex-col justify-center py-10 [animation-delay:200ms] lg:px-10">
      <p className="mb-6 text-sm font-bold lg:hidden">GNOUHT TOGETHER</p>
      <span className="mb-4 grid size-12 place-items-center rounded-2xl bg-[var(--lime)] text-[#1d230e]"><Mail size={24} /></span>
      <h2 className="text-4xl font-black tracking-[-.04em]">Chào bạn.</h2>
      <p className="mt-3 leading-6 text-[var(--muted)]">Đăng nhập bằng liên kết hoặc mã gửi qua email, không cần nhớ mật khẩu.</p>
      {!auth.configured ? <div role="alert" className="mt-8 rounded-3xl bg-amber-100 p-5 text-sm text-amber-950">Supabase chưa cấu hình. Thêm URL và publishable key vào <code>.env.local</code>.</div>
        : <form onSubmit={submit} className="mt-6 space-y-4" aria-busy={pending}>
          <label className="block text-sm font-semibold" htmlFor="login-email">Email của bạn</label>
          <input id="login-email" className="field w-full" type="email" autoComplete="email" inputMode="email" required disabled={pending} value={email} onChange={event => setEmail(event.target.value)} placeholder="ban@gmail.com" aria-describedby="email-help" />
          {error && <p role="alert" className="text-sm leading-6 text-[var(--danger)]">{error}</p>}
          {auth.linkFailed && !error && !acceptedEmail && <p role="alert" className="text-sm leading-6 text-[var(--danger)]">Chưa đăng nhập được bằng liên kết này. Có thể nó đã hết hạn hoặc đã được dùng. Nhập email để nhận thư mới.</p>}
          {acceptedEmail && <div role="status" className="rounded-2xl bg-[var(--lime)] p-4 text-sm leading-6 text-[#1d230e]"><b>Đã gửi thư tới {acceptedEmail}.</b><p>Mở thư để lấy mã 6 số hoặc bấm liên kết đăng nhập. Chưa thấy thì xem mục Spam.</p></div>}
          <Button className="w-full" type="submit" disabled={pending || remaining > 0}>{pending ? "Đang gửi yêu cầu…" : remaining > 0 ? `Có thể gửi lại sau ${remaining}s` : acceptedEmail ? "Gửi lại liên kết" : "Gửi liên kết"}<ArrowRight size={17} /></Button>
          <p id="email-help" className="text-xs leading-5 text-[var(--muted)]">Bạn sẽ nhận một thư có liên kết và mã đăng nhập.</p>
        </form>}
      {acceptedEmail && <form onSubmit={verify} className="mt-5 space-y-3" aria-busy={verifying}>
        <label className="block text-sm font-semibold" htmlFor="login-code">Mã 6 số trong email (nếu có)</label>
        <input id="login-code" className="field w-full tracking-[.4em]" inputMode="numeric" autoComplete="one-time-code" maxLength={6} required value={code} onChange={event => setCode(event.target.value.replace(/\D/g, ""))} placeholder="000000" />
        {codeError && <p role="alert" className="text-sm leading-6 text-[var(--danger)]">{codeError}</p>}
        <Button className="w-full" type="submit" variant="secondary" disabled={verifying || code.length !== 6}>{verifying ? "Đang kiểm tra…" : "Đăng nhập bằng mã"}</Button>
      </form>}
      <details className="mt-5 rounded-2xl border border-[var(--border)] p-4 text-sm">
        <summary className="min-h-6 cursor-pointer font-semibold">Không nhận được thư?</summary>
        <p className="mt-3 leading-6 text-[var(--muted)]">{local ? "Bạn đang dùng Supabase local. Email thử nghiệm vào Mailpit, không được gửi tới Gmail." : "Xem lại địa chỉ email, rồi tìm trong mục Spam và Tất cả thư. Thư thường tới trong một phút. Hết thời gian chờ, bạn bấm gửi lại được."}</p>
        {local && <a className="mt-2 inline-block min-h-11 py-2 font-semibold underline" href="http://127.0.0.1:55324" target="_blank" rel="noreferrer">Mở Mailpit (máy chạy Supabase local)</a>}
      </details>
      {(import.meta.env.DEV || import.meta.env.VITE_ENABLE_DEMO === "true") && <Link className="mt-5 flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-[var(--border)] px-4 py-3 text-sm font-semibold hover:bg-[var(--soft)]" to="/demo/location"><MapPin size={18} /> Xem bản đồ thử với An & Bình</Link>}
    </section>
  </main>;
}

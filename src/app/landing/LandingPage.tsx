import { ArrowRight, Download, LockKeyhole, Share, Smartphone, SquarePlus } from "lucide-react";
import { useEffect, useRef, useSyncExternalStore, type ReactNode } from "react";
import { Link, useLocation } from "react-router-dom";
import { installOffer } from "../../kernel/install";
import { t } from "../../kernel/i18n";
import { Button } from "../../kernel/ui/Button";
import { LanguageSwitch } from "../../kernel/ui/LanguageSwitch";
import { ThemeSwitch } from "../../kernel/ui/ThemeSwitch";
import { formatPublicMetric, usePublicSiteMetrics } from "./publicMetrics";
import { AnswerDrawing, BarDrawing, MeetDrawing, PhoneDrawing, RingsDrawing, screenDrawings, StepArrow, TurnOnDrawing } from "./drawings";

const primary = "inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-[var(--ink)] px-5 text-sm font-semibold text-[var(--paper)] transition-[transform,box-shadow] duration-200 ease-[var(--ease-out)] hover:-translate-y-0.5 hover:shadow-lg active:scale-[.97]";
const quiet = "inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl px-4 text-sm font-semibold hover:bg-[color-mix(in_srgb,var(--ink)_7%,transparent)]";
const card = "rounded-[1.75rem] border border-black/8 bg-[color-mix(in_srgb,var(--surface)_88%,transparent)] p-5 backdrop-blur-md dark:border-white/8";

/** A part of the page that rises into place the first time it scrolls into view. Its arrows draw themselves then. */
function Part({ id, label, title, intro, children }: { id: string; label: string; title: string; intro?: string; children: ReactNode }) {
  const box = useRef<HTMLElement>(null);
  useEffect(() => {
    const node = box.current;
    if (!node) return;
    if (!("IntersectionObserver" in window)) { node.classList.add("in"); return; }
    const seen = new IntersectionObserver(entries => { if (entries.some(entry => entry.isIntersecting)) { node.classList.add("in"); seen.disconnect(); } }, { threshold: 0.12 });
    seen.observe(node);
    return () => seen.disconnect();
  }, []);
  return <section ref={box} id={id} aria-labelledby={`${id}-title`} className="reveal scroll-mt-24 py-12 sm:py-16">
    <p className="text-xs font-bold uppercase tracking-[.18em] text-[var(--focus)]">{label}</p>
    <h2 id={`${id}-title`} className="mt-2 max-w-2xl text-3xl font-black tracking-[-.04em] sm:text-4xl">{title}</h2>
    {intro && <p className="mt-3 max-w-2xl leading-7 text-[var(--muted)]">{intro}</p>}
    <div className="mt-8">{children}</div>
  </section>;
}

/**
 * What a visitor sees before signing in: what the app is, how a day with it goes, what is in it,
 * who sees what, and how to put it on a phone. It is told with drawings, in the app's own look.
 */
export default function LandingPage() {
  const canInstall = useSyncExternalStore(installOffer.subscribe, installOffer.available);
  const metrics = usePublicSiteMetrics();
  // The page is shown at whatever address the visitor came to. Sign-in leads back there.
  const signIn = { from: useLocation().pathname };
  const steps = [
    { drawing: <TurnOnDrawing />, title: t("Bật một mode"), text: t("Chạm “Cà phê”, “Học bài” hay “Đang rảnh”, kèm một tấm ảnh nếu muốn. Mode tự tắt sau vài giờ.") },
    { drawing: <AnswerDrawing />, title: t("Bạn bè thấy và rủ"), text: t("Những người bạn đã kết nối thấy ngay trên màn hình đầu tiên, nhắn một câu hoặc xem lịch rảnh.") },
    { drawing: <MeetDrawing />, title: t("Cùng sắp xếp thời gian"), text: t("Chia sẻ giờ bận để tìm lúc cả hai đều rảnh, rồi chia sẻ vị trí trong một khoảng thời gian nếu cần.") },
  ];
  const screens = [
    { name: "Mode", text: t("Ai đang làm gì, ngay lúc này. Story mất sau 24 giờ, ảnh vẫn được lưu vào kho.") },
    { name: t("Lịch"), text: t("Sự kiện, thời khóa biểu và nhập file .ics.") },
    { name: t("Trò chuyện"), text: t("Nhắn riêng, nhắn nhóm và gửi ảnh.") },
    { name: t("Quan hệ"), text: t("Quản lý bạn bè, lời mời và vị trí được chia sẻ.") },
    { name: "Menu", text: t("Lịch, thói quen, ghi chú, nhóm và bạn bè.") },
  ];
  const circles = [
    { swatch: "bg-[var(--ink)]", title: t("Chỉ mình bạn"), text: t("Ghi chú, thói quen và sự kiện riêng.") },
    { swatch: "bg-[var(--lime-strong)]", title: t("Bạn bè bạn chọn"), text: t("Mode, ảnh trong 24 giờ, vị trí trong thời hạn bạn đặt, và giờ bận khi bạn đồng ý.") },
    { swatch: "border-2 border-dashed border-[var(--muted)]", title: t("Người khác"), text: t("Không thấy gì. Ứng dụng không có trang cá nhân công khai.") },
  ];
  const questions = [
    [t("Có mất tiền không?"), t("Không. Ứng dụng miễn phí và không có quảng cáo.")],
    [t("Ai dùng được?"), t("Ai có tài khoản Google hoặc email đều đăng ký được. Bạn chỉ thấy những người đã kết bạn với bạn.")],
    [t("Vị trí của tôi có bị theo dõi không?"), t("Không. Vị trí chỉ được gửi khi bạn bật chia sẻ, tới những người bạn chọn, và máy chủ chỉ giữ vị trí mới nhất.")],
    [t("Muốn xóa tài khoản thì sao?"), t("Vào Cài đặt, tải dữ liệu của bạn về nếu cần, rồi xóa tài khoản. Dữ liệu của bạn bị xóa khỏi máy chủ.")],
  ];

  return <div className="relative min-h-dvh overflow-x-clip bg-[var(--paper)] text-[var(--ink)]">
    <div className="aurora" aria-hidden><i /><i /><i /></div>
    <header className="glass sticky top-0 z-30 border-b border-black/5 dark:border-white/5">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-2 px-4 py-2 sm:px-6">
        <a href="#top" className="flex min-h-11 min-w-0 items-center gap-2 font-black tracking-tight"><img src="/icon.svg" alt="" className="size-8 shrink-0 rounded-xl" /> <span className="truncate">Gnouht Together</span></a>
        <Link to="/login" state={signIn} className={`${primary} !min-h-11 shrink-0 whitespace-nowrap !px-3.5 sm:!px-5`}>{t("Đăng nhập")}</Link>
      </div>
    </header>

    <main id="top" className="relative z-10 mx-auto max-w-6xl px-4 sm:px-6">
      <section aria-labelledby="top-title" className="grid items-center gap-10 py-10 sm:py-16 lg:grid-cols-[1.08fr_.92fr]">
        <div>
          <p className="animate-rise text-xs font-bold uppercase tracking-[.18em] text-[var(--focus)]">{t("Cho nhóm bạn thân và bạn cùng lớp")}</p>
          <h1 id="top-title" className="animate-rise mt-3 text-[2.6rem] font-black leading-[.98] tracking-[-.05em] [animation-delay:80ms] sm:text-6xl">{t("Biết bạn bè đang làm gì. Hẹn nhau trong vài chạm.")}</h1>
          <p className="animate-rise mt-5 max-w-xl text-lg leading-8 text-[var(--muted)] [animation-delay:160ms]">{t("Gnouht Together cho bạn thấy ai đang rảnh, đang học hay đang cà phê, để nhắn nhau, chốt lịch và tìm nhau trên bản đồ. Mọi thứ là của riêng bạn cho tới khi bạn chọn chia sẻ.")}</p>
          <div className="animate-rise mt-7 flex flex-col gap-2 [animation-delay:240ms] sm:flex-row sm:flex-wrap">
            <Link to="/login" state={signIn} className={`${primary} !min-h-14 !px-6 !text-base`}>{t("Đăng nhập để bắt đầu")} <ArrowRight size={18} /></Link>
            <a href="#how" className={quiet}>{t("Xem ứng dụng làm gì")}</a>
          </div>
          <p className="animate-rise mt-4 flex items-center gap-2 text-sm text-[var(--muted)] [animation-delay:320ms]"><LockKeyhole size={16} className="shrink-0" /> {t("Miễn phí. Đăng nhập bằng Google hoặc email, không cần mật khẩu.")}</p>
        </div>
        <PhoneDrawing />
      </section>

      <section aria-labelledby="community-metrics-title" className="pb-4">
        <div className={`${card} grid gap-x-6 gap-y-4 sm:grid-cols-[repeat(3,minmax(0,1fr))] sm:items-center`}>
          <h2 id="community-metrics-title" className="sr-only">{t("Hoạt động cộng đồng")}</h2>
          <div>
            <p className="text-sm font-semibold text-[var(--muted)]">{t("Thành viên")}</p>
            <p aria-live="polite" className="mt-1 text-3xl font-black tracking-tight">{formatPublicMetric(metrics?.users ?? null)}</p>
          </div>
          <div>
            <p className="text-sm font-semibold text-[var(--muted)]">{t("Lượt xem trang")}</p>
            <p aria-live="polite" className="mt-1 text-3xl font-black tracking-tight">{formatPublicMetric(metrics?.visits ?? null)}</p>
          </div>
          <div>
            <p className="text-sm font-semibold text-[var(--muted)]">{t("Lượt request")}</p>
            <p aria-live="polite" className="mt-1 text-3xl font-black tracking-tight">{metrics.requests === null ? "—" : `≈ ${formatPublicMetric(metrics.requests)}`}</p>
          </div>
          <p className="text-xs leading-5 text-[var(--muted)] sm:col-span-3">{t("Cập nhật mỗi phút · lượt xem trang và request ước tính từ 08/10/2026; request gồm file tĩnh và bot trên host app.")}</p>
        </div>
      </section>

      <Part id="how" label={t("Một ngày với Gnouht")} title={t("Từ “đang làm gì đó?” tới lúc gặp nhau")} intro={t("Ba bước, mỗi bước một hai chạm.")}>
        <ol className="flex flex-col items-stretch gap-3 lg:flex-row lg:items-center">
          {steps.map((step, index) => <li key={step.title} className="contents">
            {index > 0 && <StepArrow />}
            <div className={`${card} flex-1`}>
              {step.drawing}
              <p className="mt-4 flex items-center gap-2 text-lg font-black tracking-tight"><span className="grid size-7 shrink-0 place-items-center rounded-full bg-[var(--lime)] text-sm text-[var(--ink)]">{index + 1}</span>{step.title}</p>
              <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{step.text}</p>
            </div>
          </li>)}
        </ol>
      </Part>

      <Part id="features" label={t("Trong ứng dụng có gì")} title={t("Năm màn hình ở thanh dưới, mỗi màn hình một việc")}>
        <BarDrawing />
        <ol className="mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
          {screens.map((screen, index) => <li key={screen.name} className={`${card} !p-4`}>
            {screenDrawings[index]}
            <p className="mt-3 flex items-center gap-2 font-black tracking-tight"><span className="grid size-6 shrink-0 place-items-center rounded-full bg-[var(--lime)] text-xs text-[var(--ink)]">{index + 1}</span>{screen.name}</p>
            <p className="mt-1.5 text-sm leading-6 text-[var(--muted)]">{screen.text}</p>
          </li>)}
        </ol>
      </Part>

      <Part id="privacy" label={t("Ai thấy gì")} title={t("Riêng tư là mặc định, chia sẻ là lựa chọn")} intro={t("Không ai thấy gì của bạn cho tới khi bạn chia sẻ. Mỗi thứ bạn chia sẻ đều có người nhận, và phần lớn có thời hạn.")}>
        <div className={`${card} grid items-center gap-6 md:grid-cols-[18rem_1fr]`}>
          <RingsDrawing />
          <div>
            <ul className="space-y-4">{circles.map(circle => <li key={circle.title} className="flex gap-3">
              <i aria-hidden className={`mt-1 block size-4 shrink-0 rounded-full ${circle.swatch}`} />
              <span><b className="block">{circle.title}</b><span className="text-sm leading-6 text-[var(--muted)]">{circle.text}</span></span>
            </li>)}</ul>
            <p className="mt-5 text-xs leading-5 text-[var(--muted)]">{t("Tin nhắn được bảo vệ bằng quyền truy cập trên máy chủ. Chúng không được mã hóa đầu cuối.")}</p>
          </div>
        </div>
      </Part>

      <Part id="install" label={t("Dùng như một ứng dụng")} title={t("Cài lên màn hình chính, không cần cửa hàng ứng dụng")} intro={t("Gnouht chạy trong trình duyệt. Cài xong, nó mở toàn màn hình và gửi được thông báo đẩy.")}>
        <div className="grid gap-3 md:grid-cols-2">
          <div className={card}>
            <p className="flex items-center gap-2 font-black tracking-tight"><Smartphone size={18} /> Android · Chrome</p>
            <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{t("Mở menu của trình duyệt rồi chọn “Cài đặt ứng dụng” hoặc “Thêm vào màn hình chính”.")}</p>
            {canInstall && <Button variant="secondary" className="mt-3" onClick={() => void installOffer.accept()}><Download size={17} /> {t("Cài ngay")}</Button>}
          </div>
          <div className={card}>
            <p className="flex items-center gap-2 font-black tracking-tight"><Smartphone size={18} /> iPhone · iPad</p>
            <ol className="mt-3 flex flex-wrap items-center gap-2 text-sm font-semibold">
              <li className="inline-flex min-h-10 items-center gap-2 rounded-2xl bg-[var(--soft)] px-3"><Share size={16} /> {t("Chia sẻ")}</li>
              <li aria-hidden className="text-[var(--muted)]">→</li>
              <li className="inline-flex min-h-10 items-center gap-2 rounded-2xl bg-[var(--soft)] px-3"><SquarePlus size={16} /> {t("Thêm vào Màn hình chính")}</li>
            </ol>
            <p className="mt-3 text-sm leading-6 text-[var(--muted)]">{t("Làm trong Safari. Trên iPhone và iPad, thông báo đẩy chỉ có sau bước này.")}</p>
          </div>
        </div>
      </Part>

      <Part id="questions" label={t("Câu hỏi thường gặp")} title={t("Trước khi bắt đầu")}>
        <div className="grid gap-2 md:grid-cols-2">{questions.map(([question, answer]) => <details key={question} className={`${card} !p-0`}>
          <summary className="flex min-h-14 cursor-pointer items-center px-5 font-bold">{question}</summary>
          <p className="px-5 pb-5 text-sm leading-6 text-[var(--muted)]">{answer}</p>
        </details>)}</div>
      </Part>

      <section aria-label={t("Bắt đầu")} className="mb-10 rounded-[2rem] bg-[#24151f] p-8 text-center text-[#fff3f8] sm:p-12">
        <p className="mx-auto max-w-xl text-3xl font-black leading-tight tracking-[-.04em] sm:text-4xl">{t("Ít nhắn “khi nào rảnh?” hơn. Gặp nhau nhiều hơn.")}</p>
        <Link to="/login" state={signIn} className="mt-6 inline-flex min-h-14 items-center justify-center gap-2 rounded-2xl bg-[#f7bdd7] px-6 font-semibold text-[var(--ink)] transition-transform duration-200 hover:-translate-y-0.5 active:scale-[.97]">{t("Đăng nhập để bắt đầu")} <ArrowRight size={18} /></Link>
      </section>
    </main>

    <footer className="relative z-10 border-t border-black/8 dark:border-white/8">
      <div className="mx-auto flex max-w-6xl flex-col gap-4 px-4 py-6 sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <p className="text-sm text-[var(--muted)]">Gnouht Together · 9try.gnouht.space</p>
        <div className="flex flex-col gap-2 sm:flex-row"><div className="sm:w-48"><LanguageSwitch label={t("Ngôn ngữ")} /></div><div className="sm:w-72"><ThemeSwitch /></div></div>
      </div>
    </footer>
  </div>;
}

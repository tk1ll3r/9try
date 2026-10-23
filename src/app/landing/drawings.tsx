import { CalendarCheck2, CalendarDays, Camera, Clock, Coffee, Gamepad2, BookOpen, Heart, LayoutGrid, MessageCircle, Network, Radio, Smile } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { t } from "../../kernel/i18n";

// The drawings of the landing page. They are markup and inline SVG in the app's own colors, so they
// follow the light and the dark look, weigh little, and need no picture file. Each is one image to a
// screen reader, with a sentence that says what it shows.

const friends = [
  { name: "Kha", color: "#a16207", Icon: Coffee },
  { name: "Lan", color: "#3b82f6", Icon: BookOpen },
  { name: "Thu", color: "#22c55e", Icon: Smile },
  { name: "Vy", color: "#10b981", Icon: Gamepad2 },
];

/** A face with the turning ring of the app's Mode screen. */
function Face({ name, color, Icon, size = "size-11" }: { name: string; color: string; Icon: typeof Coffee; size?: string }) {
  return <span className="mode-ring" style={{ "--mode": color } as CSSProperties}>
    <span className={`grid ${size} place-items-center rounded-full border-[3px] border-[var(--surface)] bg-[var(--ink)] text-sm font-black text-[var(--paper)]`}>{name[0]}</span>
    <span className="absolute -bottom-1 -right-1 grid size-5 place-items-center rounded-full border-2 border-[var(--surface)] text-white" style={{ background: color }}><Icon size={11} strokeWidth={2.4} /></span>
  </span>;
}

/** A small scene that stands for a photo: a cup on a table by a window. */
function Photo({ className = "" }: { className?: string }) {
  return <svg viewBox="0 0 160 200" className={className} preserveAspectRatio="xMidYMid slice">
    <defs>
      <linearGradient id="landing-wall" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#f7deb0" /><stop offset="1" stopColor="#e7a36b" /></linearGradient>
      <linearGradient id="landing-table" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#8a5a3c" /><stop offset="1" stopColor="#5f3b26" /></linearGradient>
    </defs>
    <rect width="160" height="200" fill="url(#landing-wall)" />
    <rect x="92" y="18" width="52" height="70" rx="6" fill="#fff6dd" opacity=".75" />
    <path d="M118 18v70M92 53h52" stroke="#e7a36b" strokeWidth="3" />
    <circle cx="36" cy="46" r="20" fill="#fff3c9" opacity=".7" />
    <path d="M0 140h160v60H0z" fill="url(#landing-table)" />
    <ellipse cx="78" cy="150" rx="46" ry="9" fill="#00000026" />
    <path d="M50 104h56v26a28 22 0 0 1-56 0z" fill="#fffdf7" />
    <path d="M106 110c16-2 18 20 0 20" fill="none" stroke="#fffdf7" strokeWidth="7" strokeLinecap="round" />
    <ellipse cx="78" cy="104" rx="28" ry="7" fill="#6b3f24" />
    <path d="M66 86c-6-9 6-12 0-22M82 88c-6-9 6-12 0-22" fill="none" stroke="#fffdf7" strokeWidth="3" strokeLinecap="round" opacity=".8" />
  </svg>;
}

/** The app's first screen, as a phone: the person's own mode, a friend's photo, and the friends who have a mode on. */
export function PhoneDrawing() {
  return <div role="img" aria-label={t("Màn hình đầu tiên của ứng dụng: việc bạn đang làm, một tấm ảnh bạn bè vừa đăng, và những người bạn đang bật mode")} className="relative mx-auto w-[min(18.5rem,76vw)] select-none">
    <div aria-hidden className="animate-float rounded-[2.6rem] border border-black/10 bg-[#1a1218] p-2 shadow-[0_40px_90px_-30px_rgba(0,0,0,.5)] dark:border-white/15">
      <div className="space-y-2.5 overflow-hidden rounded-[2.1rem] bg-[var(--paper)] p-3 text-[var(--ink)]">
        <span className="mx-auto block h-1.5 w-14 rounded-full bg-[var(--soft)]" />
        <p className="text-[13px] font-black tracking-tight">{t("Mọi người đang làm gì?")}</p>
        <div className="mode-glow flex items-center gap-2.5 rounded-2xl bg-[var(--surface)] p-2.5" style={{ "--mode": "#a16207" } as CSSProperties}>
          <span className="relative grid size-11 shrink-0 place-items-center">
            <svg viewBox="0 0 44 44" className="absolute inset-0 -rotate-90"><circle cx="22" cy="22" r="19" fill="none" className="stroke-[var(--soft)]" strokeWidth="4" /><circle cx="22" cy="22" r="19" fill="none" stroke="#a16207" strokeWidth="4" strokeLinecap="round" strokeDasharray="119" strokeDashoffset="36" /></svg>
            <span className="grid size-7 place-items-center rounded-full text-white" style={{ background: "#a16207" }}><Coffee size={15} /></span>
          </span>
          <span className="min-w-0"><span className="block text-[9px] font-bold uppercase tracking-wider text-[var(--muted)]">{t("Bạn đang")}</span><span className="block truncate text-sm font-black">{t("Cà phê")}</span></span>
        </div>
        <div className="relative overflow-hidden rounded-[1.4rem]">
          <Photo className="block aspect-[4/5] w-full" />
          <div className="absolute inset-x-2 top-2 flex gap-1">{[0, 1, 2].map(tick => <span key={tick} className={`h-1 flex-1 rounded-full ${tick === 0 ? "bg-white" : "bg-white/45"}`} />)}</div>
          <div className="absolute inset-x-2 bottom-2 flex items-center gap-2 rounded-2xl bg-black/45 p-1.5 text-white backdrop-blur-sm">
            <span className="grid size-7 place-items-center rounded-full bg-white text-xs font-black text-[#24151f]">K</span>
            <span className="min-w-0 flex-1 truncate text-xs font-bold">Kha</span>
            <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold" style={{ background: "#a16207" }}><Coffee size={10} /> {t("Cà phê")}</span>
          </div>
        </div>
        <div className="flex justify-between px-1 pb-1 pt-1.5">{friends.map(friend => <Face key={friend.name} {...friend} size="size-10" />)}</div>
      </div>
    </div>
    {/* A mode that someone has just turned on. */}
    <span aria-hidden className="animate-pop absolute -left-3 top-[42%] inline-flex items-center gap-1.5 rounded-full bg-[var(--surface)] py-1 pl-1 pr-3 text-xs font-bold text-[var(--ink)] shadow-xl [animation-delay:700ms] sm:-left-10">
      <span className="grid size-7 place-items-center rounded-full bg-[#22c55e] text-white"><Smile size={15} /></span>{t("Đang rảnh")}
    </span>
    <span aria-hidden className="animate-pop absolute -right-2 top-[16%] grid size-11 place-items-center rounded-full bg-[var(--lime)] text-[var(--ink)] shadow-xl [animation-delay:1100ms] sm:-right-6"><Camera size={19} /></span>
  </div>;
}

const tile = "grid h-28 place-items-center overflow-hidden rounded-2xl bg-[var(--soft)]";

/** Step 1 of a day: a mode, and a photo with it. */
export const TurnOnDrawing = () => <div aria-hidden className={tile}>
  <span className="relative"><Face name="B" color="#a16207" Icon={Coffee} size="size-14" /><span className="absolute -right-5 -top-3 grid size-8 rotate-12 place-items-center rounded-xl bg-[var(--lime)] text-[var(--ink)] shadow"><Camera size={15} /></span></span>
</div>;

/** Step 2: friends see it and answer. */
export const AnswerDrawing = () => <div aria-hidden className={`${tile} px-5`}>
  <div className="w-full max-w-44 space-y-1.5 text-[11px] font-semibold">
    <p className="w-fit rounded-2xl rounded-bl-md bg-[var(--surface)] px-2.5 py-1.5">{t("Đi cùng với!")}</p>
    <p className="ml-auto flex w-fit items-center gap-1 rounded-2xl rounded-br-md bg-[var(--ink)] px-2.5 py-1.5 text-[var(--paper)]"><Clock size={11} /> 18:00?</p>
    <p className="flex w-fit items-center gap-1 rounded-2xl rounded-bl-md bg-[var(--surface)] px-2.5 py-1.5"><Heart size={11} className="fill-red-500 text-red-500" /> OK</p>
  </div>
</div>;

/** Step 3: on both calendars, and found on the map. */
export const MeetDrawing = () => <div aria-hidden className={`${tile} relative`}>
  <svg viewBox="0 0 200 112" className="absolute inset-0 size-full">
    <path d="M-10 78C40 60 70 96 120 74s60-10 100-30" fill="none" className="stroke-[var(--surface)]" strokeWidth="12" strokeLinecap="round" />
    <path d="M60-10c10 40-6 70 14 130" fill="none" className="stroke-[var(--surface)]" strokeWidth="8" strokeLinecap="round" />
    <path d="M70 52q30-26 62 0" fill="none" className="stroke-[var(--lime-strong)]" strokeWidth="2.5" strokeDasharray="3 5" strokeLinecap="round" />
  </svg>
  <span className="relative flex items-end gap-12">
    <span className="grid size-9 place-items-center rounded-full border-2 border-white bg-[#24151f] text-xs font-black text-white shadow-lg">B</span>
    <span className="grid size-9 place-items-center rounded-full border-2 border-white bg-[#24151f] text-xs font-black text-white shadow-lg">K</span>
  </span>
  <span className="absolute right-3 top-3 inline-flex items-center gap-1 rounded-full bg-[var(--surface)] px-2 py-1 text-[10px] font-bold shadow"><CalendarCheck2 size={12} className="text-[var(--tone-event)]" /> 18:00</span>
</div>;

/** The bar at the bottom of the app, with a number on each of its five screens. */
export function BarDrawing() {
  const tabs = [Radio, CalendarDays, MessageCircle, Network, LayoutGrid];
  return <div aria-hidden className="glass mx-auto flex max-w-md justify-between rounded-[1.6rem] border border-[var(--border)] px-3 py-2 shadow-lg">
    {tabs.map((Icon, index) => <span key={index} className={`relative grid size-12 place-items-center rounded-2xl ${index === 0 ? "bg-[var(--ink)] text-[var(--paper)]" : "text-[var(--muted)]"}`}>
      <Icon size={20} />
      <span className="absolute -right-1 -top-1 grid size-5 place-items-center rounded-full bg-[var(--lime)] text-[10px] font-black text-[var(--ink)]">{index + 1}</span>
    </span>)}
  </div>;
}

/** What each of the five screens looks like, in a few shapes. */
export const screenDrawings: ReactNode[] = [
  // Mode: faces with rings.
  <div key="mode" aria-hidden className={`${tile} gap-0`}><span className="flex gap-4">{friends.slice(0, 3).map(friend => <Face key={friend.name} {...friend} size="size-10" />)}</span></div>,
  // Calendar: a week with three kinds of entries.
  <div key="calendar" aria-hidden className={`${tile} px-4`}>
    <svg viewBox="0 0 196 84" className="w-full max-w-52">
      {[0, 1, 2, 3, 4, 5, 6].map(day => <rect key={day} x={day * 28 + 2} y="2" width="24" height="80" rx="8" className={day === 3 ? "fill-[var(--surface)] stroke-[var(--ink)]" : "fill-[var(--surface)]"} strokeWidth="1.5" />)}
      <rect x="6" y="14" width="16" height="22" rx="5" className="fill-[var(--tone-class)]" />
      <rect x="62" y="14" width="16" height="22" rx="5" className="fill-[var(--tone-class)]" />
      <rect x="90" y="44" width="16" height="28" rx="5" className="fill-[var(--tone-activity)]" />
      <rect x="34" y="50" width="16" height="16" rx="5" className="fill-[var(--tone-event)]" />
      <rect x="146" y="26" width="16" height="34" rx="5" className="fill-[var(--tone-event)]" />
      <rect x="174" y="14" width="16" height="12" rx="5" className="fill-[var(--tone-busy)]" />
    </svg>
  </div>,
  // Chat: two bubbles and a reaction.
  <div key="chat" aria-hidden className={`${tile} px-5`}>
    <div className="w-full max-w-44 space-y-1.5">
      <span className="block h-6 w-28 rounded-2xl rounded-bl-md bg-[var(--surface)]" />
      <span className="relative ml-auto block h-6 w-24 rounded-2xl rounded-br-md bg-[var(--ink)]"><span className="absolute -bottom-2 -left-2 grid size-5 place-items-center rounded-full bg-[var(--surface)] shadow"><Heart size={11} className="fill-red-500 text-red-500" /></span></span>
      <span className="block h-6 w-16 rounded-2xl rounded-bl-md bg-[var(--surface)]" />
    </div>
  </div>,
  // Relationships: a person connected to friends, drawn with plain lines and initials.
  <div key="relationships" aria-hidden className={`${tile} px-4`}>
    <svg viewBox="0 0 200 112" className="w-full max-w-52">
      <path d="M62 56h38M100 56l38-30M100 56l38 30" fill="none" className="stroke-[var(--border)]" strokeWidth="3" strokeLinecap="round" />
      <circle cx="52" cy="56" r="24" className="fill-[var(--ink)]" />
      <text x="52" y="61" textAnchor="middle" className="fill-[var(--paper)] text-[14px] font-bold">V</text>
      <circle cx="152" cy="24" r="21" className="fill-[var(--surface)] stroke-[var(--border)]" strokeWidth="2" />
      <text x="152" y="29" textAnchor="middle" className="fill-[var(--ink)] text-[13px] font-bold">K</text>
      <circle cx="152" cy="88" r="21" className="fill-[var(--surface)] stroke-[var(--border)]" strokeWidth="2" />
      <text x="152" y="93" textAnchor="middle" className="fill-[var(--ink)] text-[13px] font-bold">L</text>
    </svg>
  </div>,
  // Menu: everything else.
  <div key="menu" aria-hidden className={tile}>
    <div className="grid grid-cols-3 gap-2">{["var(--tone-event)", "var(--tone-activity)", "var(--tone-class)", "var(--lime-strong)", "var(--tone-busy)", "var(--ink)"].map(color => <span key={color} className="grid size-9 place-items-center rounded-xl bg-[var(--surface)]"><i className="block size-3 rounded-full" style={{ background: color }} /></span>)}</div>
  </div>,
];

/** Three rings: what stays with the person, what the friends they choose see, and everyone else outside. */
export function RingsDrawing() {
  return <svg role="img" aria-label={t("Ba vòng tròn lồng nhau: trong cùng là bạn, vòng giữa là bạn bè bạn chọn, ngoài cùng là người khác")} viewBox="0 0 240 240" className="mx-auto w-full max-w-64">
    <circle cx="120" cy="120" r="112" fill="none" className="stroke-[var(--border)]" strokeWidth="2" strokeDasharray="4 7" />
    <circle cx="120" cy="120" r="78" className="fill-[color-mix(in_srgb,var(--lime)_30%,var(--surface))] stroke-[var(--lime-strong)]" strokeWidth="2" />
    <circle cx="120" cy="120" r="38" className="fill-[var(--ink)]" />
    <g className="draw"><path pathLength="1" d="M120 82V46M152 142l32 18M88 142l-32 18" fill="none" className="stroke-[var(--lime-strong)]" strokeWidth="2.5" strokeLinecap="round" /></g>
    {[[120, 36, "K"], [192, 164, "L"], [48, 164, "T"]].map(([x, y, letter]) => <g key={letter}>
      <circle cx={x} cy={y} r="13" className="fill-[var(--surface)] stroke-[var(--ink)]" strokeWidth="2" />
      <text x={x} y={Number(y) + 4} textAnchor="middle" className="fill-[var(--ink)] text-[11px] font-black">{letter}</text>
    </g>)}
    <path d="M110 118v-6a10 10 0 0 1 20 0v6m-23 0h26a3 3 0 0 1 3 3v15a3 3 0 0 1-3 3h-26a3 3 0 0 1-3-3v-15a3 3 0 0 1 3-3z" fill="none" className="stroke-[var(--paper)]" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
    {[[22, 60], [214, 52], [226, 206], [16, 196]].map(([x, y]) => <circle key={`${x}-${y}`} cx={x} cy={y} r="5" className="fill-[var(--border)]" />)}
  </svg>;
}

/** An arrow from one step of the day to the next. It lies down on a wide screen and points down on a phone. */
export const StepArrow = () => <svg aria-hidden viewBox="0 0 64 24" className="draw mx-auto h-6 w-16 shrink-0 rotate-90 text-[var(--lime-strong)] lg:rotate-0">
  <path pathLength="1" d="M4 12c14-10 34-10 52 0" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
  <path pathLength="1" d="M48 5l9 7-11 4" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
</svg>;

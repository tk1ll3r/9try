import { useState } from "react";
import { Link } from "react-router-dom";
import { FlaskConical, Eye, RotateCcw, UserRound } from "lucide-react";
import { MapCanvas } from "./MapCanvas";
import { demoMapPoints, demoPeople } from "./demoPeople";
import { Button } from "../../../kernel/ui/Button";
import { Card } from "../../../kernel/ui/Card";
import { t } from "../../../kernel/i18n";

export function LocationDemoPage() {
  const [viewer, setViewer] = useState<(typeof demoPeople)[number]>(demoPeople[0]);
  const [hidden, setHidden] = useState<string[]>([]);
  const [focus, setFocus] = useState<{ id: string; sequence: number }>();
  const points = demoMapPoints(hidden);
  return <main className="mx-auto min-h-dvh max-w-6xl space-y-5 px-4 py-6 sm:px-6">
    <div className="flex flex-wrap items-center justify-between gap-3"><Link to="/" className="min-h-11 py-2 text-sm font-semibold underline">{t("← Về đăng nhập")}</Link>
      <span className="inline-flex items-center gap-2 rounded-full bg-[var(--lime)] px-3 py-2 text-xs font-bold text-[#1d230e]"><FlaskConical size={15} /> {t("DEMO · KHÔNG PHẢI TÀI KHOẢN THẬT")}</span></div>
    <header><h1 className="text-3xl font-black tracking-tight sm:text-4xl">{t("Bản đồ thử với An & Bình")}</h1>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--muted)]">{t("Hai hồ sơ giả lập tại địa điểm công cộng. Không đăng nhập, không gửi email, không bật GPS và không ghi dữ liệu vào Supabase. Đây không phải kiểm thử quyền riêng tư/RLS.")}</p></header>
    <div className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4">
      <p className="mb-3 text-sm font-semibold">{t("Đang xem giao diện mẫu của: {0}", viewer.name)}</p>
      <div className="flex flex-wrap gap-2">{demoPeople.map(person => <Button key={person.id} variant={viewer.id === person.id ? "primary" : "ghost"} aria-pressed={viewer.id === person.id} onClick={() => { setViewer(person); setFocus(undefined); }}><UserRound size={17} /> {t("Xem như")} {person.name}</Button>)}
        <Button variant="ghost" onClick={() => { setHidden([]); setViewer(demoPeople[0]); setFocus(undefined); }}><RotateCcw size={16} /> {t("Đặt lại demo")}</Button></div>
    </div>
    <div className="grid items-start gap-5 lg:grid-cols-[1.5fr_1fr]">
      <MapCanvas ownerKey={`demo-${viewer.id}`} points={points} focusRequest={focus} />
      <div className="space-y-5">
        <Card title={t("Hai người giả lập")}>
          <div className="space-y-3">{demoPeople.map(person => <article key={person.id} className="rounded-2xl bg-[var(--soft)] p-4">
            <h2 className="font-bold">{person.name} <span className="text-xs font-normal text-[var(--muted)]">@{person.username}</span></h2>
            <p className="mt-1 break-words text-xs leading-5 text-[var(--muted)]">{person.email}<br />{person.place}<br />{t("Vị trí giả lập, không phải GPS trực tiếp")}</p>
            <div className="mt-3 flex flex-wrap gap-2"><Button variant="ghost" disabled={hidden.includes(person.id)} onClick={() => setFocus(previous => ({ id: person.id, sequence: (previous?.sequence ?? 0) + 1 }))}><Eye size={16} /> {t("Tìm")} {person.name}</Button>
              <Button variant="ghost" onClick={() => setHidden(current => current.includes(person.id) ? current.filter(id => id !== person.id) : [...current, person.id])}>{hidden.includes(person.id) ? t("Hiện {0}", person.name) : t("Ẩn {0}", person.name)}</Button></div>
          </article>)}</div>
        </Card>
        <Card title={t("Việc mẫu của {0}", viewer.name)}><p className="text-sm" data-testid="demo-task">{viewer.task}</p><p className="mt-2 text-xs leading-5 text-[var(--muted)]">{t("Đổi hồ sơ chỉ thay đổi fixture trong bộ nhớ trang này. Không mô phỏng phiên Auth hoặc chứng minh dữ liệu riêng tư được bảo vệ.")}</p></Card>
      </div>
    </div>
  </main>;
}

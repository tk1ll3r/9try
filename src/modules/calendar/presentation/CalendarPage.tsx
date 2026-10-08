import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { CalendarPlus, Download, FileUp, Link2 } from "lucide-react";
import { lazy, Suspense, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { localDateKey } from "../../../kernel/dates";
import { errorMessage } from "../../../kernel/errors";
import { useAgenda, useModule } from "../../../kernel/session";
import { Button } from "../../../kernel/ui/Button";
import { MoreMenu } from "../../../kernel/ui/MoreMenu";
import { calendarModule } from "../calendar.module";
import { dayTitle, entryOf, entryOfAgenda, isDay, startOfDay, type CalendarEntry } from "../domain/calendarView";
import { toIcs } from "../domain/icsExport";
import type { CalendarOccurrence } from "../domain/Occurrence";
import { CalendarBoard } from "./CalendarBoard";
import { CalendarFeedCard } from "./CalendarFeedCard";
import { EventDialog } from "./EventDialog";
import { calendarKey } from "./keys";
import { NewEventDialog } from "./NewEventDialog";
import { t } from "../../../kernel/i18n";

// Reading an .ics file needs a parser that most visits never use.
const IcsImportCard = lazy(() => import("./IcsImportCard").then(m => ({ default: m.IcsImportCard })));

/** The user's calendar: their own events and classes, with what other modules put on it, such as confirmed meetups. */
export function CalendarPage() {
  const calendar = useModule(calendarModule);
  const loadAgenda = useAgenda();
  const navigate = useNavigate();
  const queries = useQueryClient();
  const today = localDateKey(new Date());
  // Another screen can open the calendar on a day: /calendar?date=2026-10-08.
  const [params] = useSearchParams();
  const wanted = params.get("date");
  const [day, setDay] = useState(() => isDay(wanted) ? wanted : today);
  useEffect(() => { if (isDay(wanted)) setDay(wanted); }, [wanted]);
  const [range, setRange] = useState<[from: string, until: string]>();
  const [adding, setAdding] = useState<{ day: string; time?: string }>({ day });
  const [addOpen, setAddOpen] = useState(false);
  // `opened` counts the openings, so an event opened again after a change shows its new values.
  const [selected, setSelected] = useState<CalendarOccurrence | null>(null);
  const [opened, setOpened] = useState(0);
  const [editOpen, setEditOpen] = useState(false);
  const [extra, setExtra] = useState<"" | "import" | "feed">("");
  const [notice, setNotice] = useState("");
  const [problem, setProblem] = useState("");

  // While another week or month loads, the days already on screen stay.
  const shown = useQuery({
    queryKey: [...calendarKey, "days", ...(range ?? [])],
    enabled: !!range,
    placeholderData: keepPreviousData,
    queryFn: async () => {
      const [from, until] = range!.map(startOfDay);
      const [events, agenda] = await Promise.all([calendar.listOccurrences(from, until), loadAgenda(from, until)]);
      return { events, entries: [...events.map(entryOf), ...agenda.map(entryOfAgenda)] };
    },
  });

  function add(onDay: string, time?: string) {
    setNotice("");
    setAdding({ day: onDay, time });
    setAddOpen(true);
  }
  // What another module put on the calendar is changed on that module's screen.
  function open(entry: CalendarEntry) {
    if (entry.to) { navigate(entry.to); return; }
    const occurrence = shown.data?.events.find(event => event.id === entry.id);
    if (!occurrence) return;
    setNotice("");
    setSelected(occurrence);
    setOpened(count => count + 1);
    setEditOpen(true);
  }
  async function exportIcs() {
    setProblem("");
    try {
      const url = URL.createObjectURL(new Blob([toIcs(await calendar.listEvents())], { type: "text/calendar" }));
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "gnouht-lich.ics";
      anchor.click();
      URL.revokeObjectURL(url);
    } catch (cause) { setProblem(errorMessage(cause, t("Chưa xuất được lịch. Hãy thử lại."))); }
  }

  const failed = problem || (shown.isError ? errorMessage(shown.error, t("Chưa tải được lịch.")) : "");
  return <div className="space-y-5">
    <header className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <p className="text-sm font-semibold text-[var(--muted)]">{dayTitle(today)}</p>
        <h1 className="mt-1 text-4xl font-black tracking-[-.045em]">{t("Lịch")}</h1>
      </div>
      <div className="flex items-center gap-1">
        <Button id="create-event-trigger" onClick={() => add(day)}><CalendarPlus size={17} /> {t("Thêm sự kiện")}</Button>
        <MoreMenu label={t("Nhập, xuất và liên kết lịch")}>
          <button type="button" onClick={() => setExtra(extra === "import" ? "" : "import")}><FileUp size={17} /> {extra === "import" ? t("Ẩn nhập lịch .ics") : t("Nhập lịch .ics")}</button>
          <button type="button" onClick={() => void exportIcs()}><Download size={17} /> {t("Xuất lịch .ics")}</button>
          <button type="button" onClick={() => setExtra(extra === "feed" ? "" : "feed")}><Link2 size={17} /> {extra === "feed" ? t("Ẩn liên kết lịch") : t("Liên kết lịch")}</button>
        </MoreMenu>
      </div>
    </header>

    {failed && <div role="alert" className="rounded-2xl bg-[var(--soft)] p-4 text-sm text-[var(--danger)]">{failed}{shown.isError && <> <Button variant="ghost" disabled={shown.isFetching} onClick={() => void shown.refetch()}>{t("Thử tải lại")}</Button></>}</div>}
    {notice && <div role="status" className="rounded-2xl bg-[var(--soft)] p-4 text-sm">{notice}</div>}

    {extra === "import" && <Suspense fallback={<p role="status">{t("Đang tải công cụ nhập lịch…")}</p>}><IcsImportCard onImported={() => queries.invalidateQueries({ queryKey: calendarKey })} /></Suspense>}
    {extra === "feed" && <CalendarFeedCard />}

    <CalendarBoard entries={shown.data?.entries ?? []} day={day} onDay={setDay} onRange={(from, until) => setRange([from, until])} onOpen={open} onAdd={add} />

    <NewEventDialog open={addOpen} onOpenChange={setAddOpen} at={adding} onCreated={setDay} />
    {selected && <EventDialog key={opened} occurrence={selected} open={editOpen} onOpenChange={setEditOpen} onDone={setNotice} />}
  </div>;
}

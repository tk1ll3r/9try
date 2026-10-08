import { Send } from "lucide-react";
import { type FormEvent, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { localDateTimeKey } from "../../../kernel/dates";
import { useModule } from "../../../kernel/session";
import { useAction } from "../../../kernel/useAction";
import { Button } from "../../../kernel/ui/Button";
import { DialogPanel } from "../../../kernel/ui/DialogPanel";
import { useAcceptedFriends } from "../../friends";
import { meetupsModule } from "../meetups.module";
import { meetupsKey } from "./labels";

/**
 * From a time that suits everyone to a proposal, in one step: makes the meetup, puts the time up for
 * the vote and invites the people, then opens the meetup's page. Times are epoch milliseconds. Give
 * it a `key` per time, so that the form starts from that time.
 */
export function ProposeMeetupDialog({ open, onOpenChange, start, end, inviteeIds }: {
  open: boolean; onOpenChange(open: boolean): void; start: number; end: number; inviteeIds: string[];
}) {
  const meetups = useModule(meetupsModule);
  const navigate = useNavigate();
  const { run, pending, error } = useAction(meetupsKey);
  const invitees = useAcceptedFriends().filter(friend => inviteeIds.includes(friend.userId));
  const [title, setTitle] = useState("");
  const [from, setFrom] = useState(() => localDateTimeKey(new Date(start)));
  const [to, setTo] = useState(() => localDateTimeKey(new Date(end)));
  const [problem, setProblem] = useState("");
  // What a first try already did. A second try after a failure goes on from there and makes no second meetup.
  const done = useRef<{ id?: string; timed?: boolean }>({});

  function propose(event: FormEvent) {
    event.preventDefault();
    const wrong = new Date(to) <= new Date(from) ? "Giờ kết thúc phải sau giờ bắt đầu." : "";
    setProblem(wrong);
    if (wrong) return;
    run(async () => {
      const step = done.current;
      step.id ??= await meetups.create({ groupId: null, title, description: "", capacity: null });
      if (!step.timed) { await meetups.addOption(step.id, new Date(from), new Date(to)); step.timed = true; }
      if (inviteeIds.length) await meetups.invite(step.id, inviteeIds);
      return step.id;
    }, id => navigate(`/meetups/${id}`));
  }

  return <DialogPanel open={open} onOpenChange={onOpenChange} busy={pending} title="Rủ mọi người"
    description="Tạo một đề xuất với khung giờ này. Người được mời bình chọn, rồi bạn chốt giờ ở trang hoạt động.">
    <form onSubmit={propose} className="grid gap-3 md:grid-cols-2" aria-busy={pending}>
      <label className="grid gap-1 text-sm font-semibold md:col-span-2">Tên hoạt động
        <input className="field" data-dialog-initial-focus required maxLength={200} value={title} onChange={event => setTitle(event.target.value)} placeholder="Ví dụ: Cà phê, học nhóm, đá bóng" />
      </label>
      <label className="grid gap-1 text-sm font-semibold">Bắt đầu<input className="field" type="datetime-local" required value={from} onChange={event => setFrom(event.target.value)} /></label>
      <label className="grid gap-1 text-sm font-semibold">Kết thúc<input className="field" type="datetime-local" required value={to} onChange={event => setTo(event.target.value)} /></label>
      <p className="rounded-2xl bg-[var(--soft)] p-3 text-sm leading-6 md:col-span-2">{invitees.length
        ? <>Mời: <b>{invitees.map(friend => friend.displayName).join(", ")}</b></>
        : "Chưa chọn ai để mời. Bạn mời được ở trang hoạt động sau khi tạo."}</p>
      {(problem || error) && <p role="alert" className="text-sm leading-6 text-[var(--danger)] md:col-span-2">{problem || error}</p>}
      <div className="md:col-span-2"><Button type="submit" className="w-full sm:w-auto" disabled={pending}><Send size={17} /> {pending ? "Đang tạo…" : invitees.length ? "Tạo và mời" : "Tạo đề xuất"}</Button></div>
    </form>
  </DialogPanel>;
}

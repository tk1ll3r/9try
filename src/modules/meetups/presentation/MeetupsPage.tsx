import { useQuery } from "@tanstack/react-query";
import { Check, ChevronRight, Clock3, Plus, UsersRound, X } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { errorMessage } from "../../../kernel/errors";
import { useModule, useUserId } from "../../../kernel/session";
import { useAction } from "../../../kernel/useAction";
import { Button } from "../../../kernel/ui/Button";
import { Card } from "../../../kernel/ui/Card";
import { useMyGroups } from "../../groups";
import { MeetupPolicy, type MeetupSummary } from "../domain/Meetup";
import { meetupsModule } from "../meetups.module";
import { formatTime, meetupsKey, rsvpLabel, statusLabel } from "./labels";

export function MeetupsPage() {
  const meetups = useModule(meetupsModule);
  const list = useQuery({ queryKey: [...meetupsKey, "list"], queryFn: () => meetups.list() });
  const groups = useMyGroups().data ?? [];
  const { run, pending, error } = useAction(meetupsKey);
  const [title, setTitle] = useState("");
  const [groupId, setGroupId] = useState("");
  const [description, setDescription] = useState("");
  const [capacity, setCapacity] = useState("");
  const [showCreate, setShowCreate] = useState(false);
  const navigate = useNavigate();
  const problem = error || (list.isError ? errorMessage(list.error, "Không thể tải hoạt động.") : "");

  function create(event: FormEvent) {
    event.preventDefault();
    // A new meetup opens on its own page, where times are proposed and people invited.
    run(() => meetups.create({ groupId: groupId || null, title, description, capacity: capacity ? Number(capacity) : null }),
      id => { setTitle(""); setDescription(""); setCapacity(""); setShowCreate(false); navigate(`/meetups/${id}`); });
  }

  return (
    <div className="space-y-5">
      <header>
        <p className="text-sm font-semibold text-[var(--muted)]">Đề xuất → bình chọn → chốt lịch</p>
        <h1 className="mt-1 text-4xl font-black tracking-[-.045em]">Hoạt động</h1>
      </header>

      <Card title="Đề xuất hoạt động" action={<Button variant="secondary" aria-expanded={showCreate} onClick={() => setShowCreate(value => !value)}><Plus size={17} /> {showCreate ? "Đóng" : "Tạo hoạt động"}</Button>}>
        {showCreate && <form onSubmit={create} aria-busy={pending} className="grid gap-3 md:grid-cols-2">
          <label className="grid gap-1 text-sm font-semibold">Tên hoạt động<input className="field" value={title} onChange={event => setTitle(event.target.value)} placeholder="Ví dụ: Ăn tối cuối tuần" maxLength={200} required /></label>
          <label className="grid gap-1 text-sm font-semibold">Nhóm<select className="field" value={groupId} onChange={event => setGroupId(event.target.value)}>
            <option value="">Không gắn nhóm</option>
            {groups.map(group => <option key={group.id} value={group.id}>{group.name}</option>)}
          </select></label>
          {groupId && <p className="text-xs text-[var(--muted)] md:col-span-2">Mọi thành viên của nhóm sẽ được mời.</p>}
          <label className="grid gap-1 text-sm font-semibold md:col-span-2">Mô tả (tùy chọn)<textarea className="field min-h-24" value={description} onChange={event => setDescription(event.target.value)} placeholder="Mô tả ngắn…" /></label>
          <label className="grid gap-1 text-sm font-semibold">Sức chứa (tùy chọn)<input className="field" type="number" min="1" value={capacity} onChange={event => setCapacity(event.target.value)} /></label>
          <Button type="submit" disabled={pending}><Plus size={17} /> {pending ? "Đang tạo…" : "Tạo đề xuất"}</Button>
        </form>}
      </Card>

      {problem && <div role="alert" className="rounded-2xl bg-[var(--soft)] p-4 text-sm text-[var(--danger)]">{problem} <Button variant="ghost" disabled={list.isFetching} onClick={() => void list.refetch()}>Thử tải lại</Button></div>}
      {list.isPending && <p role="status">Đang tải hoạt động…</p>}
      <div className="space-y-4">
        {list.isSuccess && !list.data.length && <Card><p className="py-10 text-center text-[var(--muted)]">Chưa có hoạt động nào. Tạo đề xuất để bắt đầu.</p></Card>}
        {list.data?.map(item => <MeetupRow key={item.id} item={item} />)}
      </div>
    </div>
  );
}

/** One meetup in the list: what, when, the user's answer, and the way to its page. */
function MeetupRow({ item }: { item: MeetupSummary }) {
  const meetups = useModule(meetupsModule);
  const userId = useUserId();
  const policy = new MeetupPolicy(item, userId);
  const { run, pending, error } = useAction(meetupsKey);

  return <Card>
    <Link to={`/meetups/${item.id}`} className="flex items-start gap-3 hover:underline">
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center gap-2">
          <b className="break-words text-lg">{item.title}</b>
          <span className="rounded-full bg-[var(--soft)] px-2.5 py-1 text-xs font-bold">{statusLabel[item.status]}</span>
        </span>
        <span className="mt-2 flex flex-wrap gap-3 text-xs font-semibold text-[var(--muted)]">
          <span className="inline-flex items-center gap-1"><Clock3 size={14} /> {item.startAt ? formatTime(item.startAt) : "Chưa chốt giờ"}</span>
          {item.locationName && <span>{item.locationName}</span>}
          <span className="inline-flex items-center gap-1"><UsersRound size={14} /> {item.organizerId === userId ? "Bạn tổ chức" : `Bạn: ${rsvpLabel[item.rsvp]}`}</span>
        </span>
      </span>
      <ChevronRight size={20} className="mt-1 shrink-0 text-[var(--muted)]" />
    </Link>
    {policy.canRespond && <div className="mt-3 flex flex-wrap gap-2">
      <Button disabled={pending} aria-pressed={item.rsvp === "going"} variant={item.rsvp === "going" ? "secondary" : "ghost"} aria-label={`Đi: ${item.title}`} onClick={() => run(() => meetups.respond(item.id, "going"))}><Check size={16} /> Đi</Button>
      <Button disabled={pending} aria-pressed={item.rsvp === "maybe"} variant={item.rsvp === "maybe" ? "secondary" : "ghost"} aria-label={`Có thể: ${item.title}`} onClick={() => run(() => meetups.respond(item.id, "maybe"))}>Có thể</Button>
      <Button disabled={pending} aria-pressed={item.rsvp === "declined"} variant={item.rsvp === "declined" ? "secondary" : "ghost"} aria-label={`Không đi: ${item.title}`} onClick={() => run(() => meetups.respond(item.id, "declined"))}><X size={16} /> Không</Button>
    </div>}
    {error && <p role="alert" className="mt-3 text-sm text-[var(--danger)]">{error}</p>}
  </Card>;
}

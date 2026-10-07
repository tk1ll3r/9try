import { useQuery } from "@tanstack/react-query";
import { CalendarCheck2, Check, Clock3, MessageCircle, Plus, Send, UsersRound, X, XCircle } from "lucide-react";
import { type FormEvent, useState } from "react";
import { errorMessage } from "../../../kernel/errors";
import { useModule, useUserId } from "../../../kernel/session";
import { useAction } from "../../../kernel/useAction";
import { Button } from "../../../kernel/ui/Button";
import { Card } from "../../../kernel/ui/Card";
import { PeoplePicker } from "../../friends";
import { useMyGroups } from "../../groups";
import { ActivityModesCard } from "../../presence";
import { MeetupPolicy, type MeetupSummary } from "../domain/Meetup";
import { meetupsModule } from "../meetups.module";
import { meetupsKey } from "./MeetupInvitesCard";

const statusLabel = { draft: "Nháp", proposed: "Đang đề xuất", confirmed: "Đã chốt", canceled: "Đã hủy", completed: "Đã xong" } as const;
const rsvpLabel = { going: "Đi", maybe: "Có thể", pending: "Chưa trả lời", declined: "Không đi" } as const;

const formatTime = (value: string) => new Intl.DateTimeFormat("vi-VN", { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
const formatRange = (start: string, end: string) => `${formatTime(start)} → ${new Intl.DateTimeFormat("vi-VN", { hour: "2-digit", minute: "2-digit" }).format(new Date(end))}`;

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
  const problem = error || (list.isError ? errorMessage(list.error, "Không thể tải hoạt động.") : "");

  function create(event: FormEvent) {
    event.preventDefault();
    run(() => meetups.create({ groupId: groupId || null, title, description, capacity: capacity ? Number(capacity) : null }),
      () => { setTitle(""); setDescription(""); setCapacity(""); setShowCreate(false); });
  }

  return (
    <div className="space-y-5">
      <header>
        <p className="text-sm font-semibold text-[var(--muted)]">Đề xuất → bình chọn → chốt lịch</p>
        <h1 className="mt-1 text-4xl font-black tracking-[-.045em]">Hoạt động</h1>
      </header>

      <ActivityModesCard />

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
        {list.data?.map(item => <MeetupCard key={item.id} item={item} />)}
      </div>
    </div>
  );
}

function MeetupCard({ item }: { item: MeetupSummary }) {
  const meetups = useModule(meetupsModule);
  const policy = new MeetupPolicy(item, useUserId());
  const detailKey = [...meetupsKey, "detail", item.id];
  const detail = useQuery({
    queryKey: detailKey,
    queryFn: async () => {
      const [poll, comments, participants] = await Promise.all([
        meetups.poll(item.id), meetups.comments(item.id),
        // A database without migration 0023 has no participant list. The rest of the card still works.
        meetups.participants(item.id).catch(() => []),
      ]);
      return { poll, comments, participants };
    },
  });
  // An answer, a confirmed time or a cancellation changes the list; everything else only this card.
  const whole = useAction(meetupsKey);
  const inside = useAction(detailKey);
  const busy = whole.pending || inside.pending;
  const [inviteIds, setInviteIds] = useState<string[]>([]);
  const [optionStart, setOptionStart] = useState("");
  const [optionEnd, setOptionEnd] = useState("");
  const [commentBody, setCommentBody] = useState("");
  const [notice, setNotice] = useState<{ text: string; failed: boolean } | null>(null);
  const error = whole.error || inside.error || (notice?.failed ? notice.text : "");

  function addOption(event: FormEvent) {
    event.preventDefault();
    const start = new Date(optionStart), end = new Date(optionEnd);
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) { setNotice({ text: "Giờ kết thúc phải sau giờ bắt đầu.", failed: true }); return; }
    setNotice(null);
    inside.run(() => meetups.addOption(item.id, start, end), () => { setOptionStart(""); setOptionEnd(""); });
  }
  function invite(event: FormEvent) {
    event.preventDefault();
    setNotice(null);
    if (inviteIds.length) inside.run(() => meetups.invite(item.id, inviteIds), () => { setInviteIds([]); setNotice({ text: "Đã gửi lời mời.", failed: false }); });
  }
  function postComment(event: FormEvent) {
    event.preventDefault();
    if (commentBody.trim()) inside.run(() => meetups.postComment(item.id, commentBody.trim()), () => setCommentBody(""));
  }

  return (
    <Card>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-black">{item.title}</h2>
            <span className="rounded-full bg-[var(--soft)] px-2.5 py-1 text-xs font-bold">{statusLabel[item.status]}</span>
          </div>
          {item.description && <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{item.description}</p>}
          <div className="mt-3 flex flex-wrap gap-3 text-xs font-semibold text-[var(--muted)]">
            <span className="inline-flex items-center gap-1"><UsersRound size={14} /> {item.capacity ? `Tối đa ${item.capacity}` : "Không giới hạn"}</span>
            <span className="inline-flex items-center gap-1"><Clock3 size={14} /> {item.startAt ? formatTime(item.startAt) : "Chưa chốt giờ"}</span>
            {item.locationName && <span>{item.locationName}</span>}
          </div>
        </div>

        {policy.canRespond && (
          <div className="flex flex-wrap gap-2">
            <Button disabled={busy} aria-pressed={item.rsvp === "going"} variant={item.rsvp === "going" ? "secondary" : "ghost"} onClick={() => whole.run(() => meetups.respond(item.id, "going"))}><Check size={16} /> Đi</Button>
            <Button disabled={busy} aria-pressed={item.rsvp === "maybe"} variant={item.rsvp === "maybe" ? "secondary" : "ghost"} onClick={() => whole.run(() => meetups.respond(item.id, "maybe"))}>Có thể</Button>
            <Button disabled={busy} aria-pressed={item.rsvp === "declined"} variant={item.rsvp === "declined" ? "secondary" : "ghost"} onClick={() => whole.run(() => meetups.respond(item.id, "declined"))}><X size={16} /> Không</Button>
          </div>
        )}
        {policy.canCancel && (
          <Button variant="ghost" disabled={busy} onClick={() => {
            if (window.confirm("Hủy hoạt động này? Người được mời sẽ không thể tham gia.")) whole.run(() => meetups.cancel(item.id));
          }}><XCircle size={16} /> Hủy hoạt động</Button>
        )}
      </div>

      {!!detail.data?.participants.length && (
        <ul aria-label="Người được mời" className="mt-4 flex flex-wrap gap-2">
          {detail.data.participants.map(person => <li key={person.userId} className="rounded-full bg-[var(--soft)] px-3 py-1.5 text-xs font-semibold">{person.displayName} · {rsvpLabel[person.rsvp]}</li>)}
        </ul>
      )}

      <div className="mt-5 border-t border-black/8 pt-5 dark:border-white/8">
        <p className="mb-3 text-sm font-bold">Bình chọn thời gian</p>
        {detail.isPending && <p role="status" className="text-sm text-[var(--muted)]">Đang tải bình chọn và thảo luận…</p>}
        {detail.isError && <p role="alert" className="text-sm text-[var(--danger)]">Không tải được chi tiết: {errorMessage(detail.error, "hãy thử lại.")} <Button variant="ghost" disabled={detail.isFetching} onClick={() => void detail.refetch()}>Thử lại</Button></p>}
        {detail.isSuccess && (detail.data.poll.length === 0 ? <p className="text-sm text-[var(--muted)]">Chưa có khung giờ nào được đề xuất.</p> : (
          <div className="space-y-2">
            {detail.data.poll.map(option => (
              <div key={option.optionId} className="flex flex-col gap-2 rounded-2xl bg-[var(--soft)] p-3 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold">{formatRange(option.startsAt, option.endsAt)}</p>
                  <p className="text-xs text-[var(--muted)]">{option.availableCount}/{option.totalVotes} người đã chọn rảnh</p>
                </div>
                <div className="flex gap-2">
                  <Button disabled={busy} aria-pressed={option.myVote === true} variant={option.myVote === true ? "secondary" : "ghost"} className="px-3" onClick={() => inside.run(() => meetups.vote(option.optionId, true))}>Rảnh</Button>
                  <Button disabled={busy} aria-pressed={option.myVote === false} variant={option.myVote === false ? "secondary" : "ghost"} className="px-3" onClick={() => inside.run(() => meetups.vote(option.optionId, false))}>Bận</Button>
                  {policy.canPlan && <Button disabled={busy} className="px-3" onClick={() => whole.run(() => meetups.confirm(item.id, option.optionId))}><CalendarCheck2 size={15} /> Chốt</Button>}
                </div>
              </div>
            ))}
          </div>
        ))}

        {policy.canPlan && (
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            <form onSubmit={addOption} aria-busy={busy} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
              <label className="grid gap-1 text-sm font-semibold">Bắt đầu<input className="field min-w-0" type="datetime-local" required value={optionStart} onChange={event => setOptionStart(event.target.value)} /></label>
              <label className="grid gap-1 text-sm font-semibold">Kết thúc<input className="field min-w-0" type="datetime-local" required value={optionEnd} onChange={event => setOptionEnd(event.target.value)} /></label>
              <Button type="submit" variant="secondary" disabled={busy} className="self-end"><Plus size={16} /> Giờ</Button>
            </form>
            <form onSubmit={invite} aria-busy={busy} className="space-y-2">
              <PeoplePicker legend="Mời thêm bạn bè" value={inviteIds} onChange={setInviteIds} />
              <Button type="submit" disabled={busy || !inviteIds.length}><Send size={16} /> Gửi lời mời</Button>
            </form>
          </div>
        )}
      </div>

      <div className="mt-5 border-t border-black/8 pt-5 dark:border-white/8">
        <p className="mb-3 flex items-center gap-2 text-sm font-bold"><MessageCircle size={16} /> Thảo luận</p>
        {detail.isSuccess && <div className="space-y-2">
          {detail.data.comments.map(comment => (
            <div key={comment.id} className="rounded-2xl bg-[var(--soft)] p-3">
              <div className="flex items-center justify-between gap-3">
                <b className="text-sm">{comment.authorDisplayName}</b>
                <span className="text-xs text-[var(--muted)]">{new Date(comment.createdAt).toLocaleString("vi-VN")}</span>
              </div>
              <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6">{comment.body}</p>
            </div>
          ))}
          {detail.data.comments.length === 0 && <p className="text-sm text-[var(--muted)]">Chưa có tin nhắn nào.</p>}
        </div>}
        {policy.canComment && (
          <form onSubmit={postComment} aria-busy={busy} className="mt-3 flex items-end gap-2">
            <label className="grid min-w-0 flex-1 gap-1 text-sm font-semibold">Bình luận<input className="field min-w-0" value={commentBody} onChange={event => setCommentBody(event.target.value)} placeholder="Nhắn cho mọi người trong hoạt động…" maxLength={4000} /></label>
            <Button type="submit" disabled={busy || !commentBody.trim()} aria-label="Gửi bình luận"><Send size={16} /></Button>
          </form>
        )}
      </div>

      {error && <p role="alert" className="mt-3 text-sm text-[var(--danger)]">{error}</p>}
      {notice && !notice.failed && <p role="status" className="mt-3 text-sm text-[var(--success)]">{notice.text}</p>}
    </Card>
  );
}

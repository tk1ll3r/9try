import { CalendarCheck2, Check, Clock3, MessageCircle, Plus, Send, UsersRound, X, XCircle } from "lucide-react";
import { type FormEvent, useEffect, useRef, useState } from "react";
import { useAuth } from "../../../bootstrap/AuthProvider";
import { groupsData, type GroupSummary } from "../../groups/infrastructure/GroupsData";
import { meetupsData, type MeetupComment, type MeetupListItem, type PollOption } from "../infrastructure/MeetupsData";
import { Button } from "../../../shared/ui/Button";
import { Card } from "../../../shared/ui/Card";
import { ActivityModesCard } from "./ActivityModesCard";
import { AsyncOwnerScope } from "../../../shared/domain/AsyncOwnerScope";

export function MeetupsPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<MeetupListItem[]>([]);
  const [groups, setGroups] = useState<GroupSummary[]>([]);
  const [title, setTitle] = useState("");
  const [groupId, setGroupId] = useState("");
  const [description, setDescription] = useState("");
  const [capacity, setCapacity] = useState("");
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const createLock = useRef(false);
  const scope = useRef(new AsyncOwnerScope());

  async function refresh() {
    if (!user) return;
    const current = scope.current.beginRequest(user.id);
    if (!current()) return;
    setLoading(true);
    try {
      const [nextMeetups, nextGroups] = await Promise.all([meetupsData.list(user.id), groupsData.list(user.id)]);
      if (current()) { setItems(nextMeetups); setGroups(nextGroups); setMessage(""); }
    } catch (error) {
      if (current()) setMessage(error instanceof Error ? error.message : "Không thể tải hoạt động.");
    } finally { if (current()) setLoading(false); }
  }

  useEffect(() => {
    scope.current.activate(user?.id); createLock.current = false;
    setItems([]); setGroups([]); setMessage(""); setLoading(true); setCreating(false); setShowCreate(false);
    void refresh();
    return () => scope.current.dispose();
  }, [user?.id]);

  async function create(event: FormEvent) {
    event.preventDefault();
    if (!user || createLock.current) return;
    const current = scope.current.capture(user.id);
    if (!current()) return;
    createLock.current = true; setCreating(true); setMessage("");
    try {
      await meetupsData.create({
        groupId: groupId || null,
        title,
        description,
        capacity: capacity ? Number(capacity) : null,
      });
      if (!current()) return;
      setTitle(""); setDescription(""); setCapacity(""); setShowCreate(false);
      await refresh();
    } catch (error) {
      if (current()) setMessage(error instanceof Error ? error.message : "Không thể tạo hoạt động.");
    } finally { if (current()) { createLock.current = false; setCreating(false); } }
  }

  return (
    <div className="space-y-5">
      <header>
        <p className="text-sm font-semibold text-[var(--muted)]">Đề xuất → bình chọn → chốt lịch</p>
        <h1 className="mt-1 text-4xl font-black tracking-[-.045em]">Hoạt động</h1>
      </header>

      <ActivityModesCard />

      <Card title="Đề xuất hoạt động" action={<Button variant="secondary" aria-expanded={showCreate} onClick={() => setShowCreate(value => !value)}><Plus size={17} /> {showCreate ? "Đóng" : "Tạo hoạt động"}</Button>}>
        {showCreate && <form onSubmit={create} aria-busy={creating} className="grid gap-3 md:grid-cols-2">
          <label className="grid gap-1 text-sm font-semibold">Tên hoạt động<input className="field" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ví dụ: Ăn tối cuối tuần" maxLength={200} required /></label>
          <label className="grid gap-1 text-sm font-semibold">Nhóm<select className="field" value={groupId} onChange={(e) => setGroupId(e.target.value)}>
            <option value="">Không gắn nhóm</option>
            {groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
          </select></label>
          <label className="grid gap-1 text-sm font-semibold md:col-span-2">Mô tả (tùy chọn)<textarea className="field min-h-24" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Mô tả ngắn…" /></label>
          <label className="grid gap-1 text-sm font-semibold">Sức chứa (tùy chọn)<input className="field" type="number" min="1" value={capacity} onChange={(e) => setCapacity(e.target.value)} /></label>
          <Button type="submit" disabled={creating}><Plus size={17} /> {creating ? "Đang tạo…" : "Tạo đề xuất"}</Button>
        </form>}
      </Card>

      {message && <div role="alert" className="rounded-2xl bg-[var(--soft)] p-4 text-sm">{message} <Button variant="ghost" disabled={loading} onClick={() => void refresh()}>Thử tải lại</Button></div>}
      {loading && !items.length && <p role="status">Đang tải hoạt động…</p>}
      <div className="space-y-4">
        {!loading && !message && items.length === 0
          ? <Card><p className="py-10 text-center text-[var(--muted)]">Chưa có hoạt động nào. Tạo đề xuất để bắt đầu.</p></Card>
          : items.map((item) => <MeetupCard key={`${user?.id}:${item.id}`} item={item} userId={user?.id ?? ""} onChanged={refresh} />)}
      </div>
    </div>
  );
}

function MeetupCard({ item, userId, onChanged }: { item: MeetupListItem; userId: string; onChanged(): Promise<void> }) {
  const organizer = item.organizerId === userId;
  const [poll, setPoll] = useState<PollOption[]>([]);
  const [comments, setComments] = useState<MeetupComment[]>([]);
  const [inviteUsername, setInviteUsername] = useState("");
  const [optionStart, setOptionStart] = useState("");
  const [optionEnd, setOptionEnd] = useState("");
  const [commentBody, setCommentBody] = useState("");
  const [error, setError] = useState("");
  const [feedback, setFeedback] = useState("");
  const [detailError, setDetailError] = useState("");
  const [detailLoading, setDetailLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const lock = useRef(false);
  const scope = useRef(new AsyncOwnerScope());

  async function loadDetails() {
    const current = scope.current.beginRequest(userId);
    if (!current()) return;
    setDetailLoading(true); setDetailError("");
    try {
      const [nextPoll, nextComments] = await Promise.all([meetupsData.poll(item.id), meetupsData.comments(item.id)]);
      if (current()) { setPoll(nextPoll); setComments(nextComments); }
    } catch (cause) {
      if (current()) setDetailError(humanize(cause));
    } finally { if (current()) setDetailLoading(false); }
  }

  useEffect(() => {
    scope.current.activate(userId); lock.current = false;
    setPoll([]); setComments([]); setDetailLoading(true); setDetailError(""); setError(""); setFeedback(""); setBusy(false);
    void loadDetails();
    return () => scope.current.dispose();
  }, [item.id, userId]);

  async function mutate(action: () => Promise<void>, after?: () => Promise<void> | void, success?: string) {
    if (lock.current) return;
    const current = scope.current.capture(userId);
    if (!current()) return;
    lock.current = true; setBusy(true); setError(""); setFeedback("");
    try {
      await action();
      if (!current()) return;
      await after?.();
      if (current() && success) setFeedback(success);
    } catch (cause) {
      if (current()) setError(humanize(cause));
    } finally { if (current()) { lock.current = false; setBusy(false); } }
  }

  function respond(response: "going" | "maybe" | "declined") {
    return mutate(() => meetupsData.respond(item.id, response), onChanged);
  }

  function invite(event: FormEvent) {
    event.preventDefault();
    return mutate(() => meetupsData.invite(item.id, inviteUsername), () => setInviteUsername(""), "Đã gửi lời mời.");
  }

  function addOption(event: FormEvent) {
    event.preventDefault();
    const start = new Date(optionStart), end = new Date(optionEnd);
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) {
      setError("Giờ kết thúc phải sau giờ bắt đầu."); return;
    }
    return mutate(() => meetupsData.addOption(item.id, start, end), async () => {
      setOptionStart(""); setOptionEnd(""); await loadDetails();
    });
  }

  function postComment(event: FormEvent) {
    event.preventDefault();
    if (!commentBody.trim()) return;
    return mutate(() => meetupsData.postComment(item.id, commentBody.trim()), async () => {
      setCommentBody(""); await loadDetails();
    });
  }

  return (
    <Card>
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-xl font-black">{item.title}</h2>
            <span className="rounded-full bg-[var(--soft)] px-2.5 py-1 text-xs font-bold">{statusLabel(item.status)}</span>
          </div>
          {item.description && <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{item.description}</p>}
          <div className="mt-3 flex flex-wrap gap-3 text-xs font-semibold text-[var(--muted)]">
            <span className="inline-flex items-center gap-1"><UsersRound size={14} /> {item.capacity ? `Tối đa ${item.capacity}` : "Không giới hạn"}</span>
            <span className="inline-flex items-center gap-1"><Clock3 size={14} /> {item.startAt ? formatTime(item.startAt) : "Chưa chốt giờ"}</span>
            {item.locationName && <span>{item.locationName}</span>}
          </div>
        </div>

        {!organizer && item.status !== "canceled" && item.status !== "completed" && (
          <div className="flex flex-wrap gap-2">
            <Button disabled={busy} variant={item.rsvp === "going" ? "secondary" : "ghost"} onClick={() => void respond("going")}><Check size={16} /> Đi</Button>
            <Button disabled={busy} variant={item.rsvp === "maybe" ? "secondary" : "ghost"} onClick={() => void respond("maybe")}>Có thể</Button>
            <Button disabled={busy} variant="ghost" onClick={() => void respond("declined")}><X size={16} /> Không</Button>
          </div>
        )}

        {organizer && item.status !== "canceled" && item.status !== "completed" && (
          <Button variant="ghost" disabled={busy} onClick={() => {
            if (window.confirm("Hủy hoạt động này? Người được mời sẽ không thể tham gia.")) void mutate(() => meetupsData.cancel(item.id), onChanged);
          }}><XCircle size={16} /> Hủy hoạt động</Button>
        )}
      </div>

      <div className="mt-5 border-t border-black/8 pt-5 dark:border-white/8">
        <p className="mb-3 text-sm font-bold">Bình chọn thời gian</p>
        {detailLoading && <p role="status" className="text-sm text-[var(--muted)]">Đang tải bình chọn và thảo luận…</p>}
        {detailError && <p role="alert" className="text-sm text-[var(--danger)]">Không tải được chi tiết: {detailError} <Button variant="ghost" disabled={detailLoading} onClick={() => void loadDetails()}>Thử lại</Button></p>}
        {!detailLoading && !detailError && poll.length === 0 ? <p className="text-sm text-[var(--muted)]">Chưa có khung giờ nào được đề xuất.</p> : !detailError && !detailLoading && (
          <div className="space-y-2">
            {poll.map((option) => (
              <div key={option.optionId} className="flex flex-col gap-2 rounded-2xl bg-[var(--soft)] p-3 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold">{formatRange(option.startsAt, option.endsAt)}</p>
                  <p className="text-xs text-[var(--muted)]">{option.availableCount}/{option.totalVotes || 0} người đã chọn rảnh</p>
                </div>
                <div className="flex gap-2">
                  <Button disabled={busy} aria-pressed={option.myVote === true} variant={option.myVote === true ? "secondary" : "ghost"} className="px-3" onClick={() => void mutate(() => meetupsData.vote(option.optionId, true), loadDetails)}>Rảnh</Button>
                  <Button disabled={busy} aria-pressed={option.myVote === false} variant={option.myVote === false ? "secondary" : "ghost"} className="px-3" onClick={() => void mutate(() => meetupsData.vote(option.optionId, false), loadDetails)}>Bận</Button>
                  {organizer && item.status === "proposed" && <Button disabled={busy} className="px-3" onClick={() => void mutate(() => meetupsData.confirm(item.id, option.optionId), onChanged)}><CalendarCheck2 size={15} /> Chốt</Button>}
                </div>
              </div>
            ))}
          </div>
        )}

        {organizer && item.status === "proposed" && (
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            <form onSubmit={addOption} aria-busy={busy} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
              <label className="grid gap-1 text-sm font-semibold">Bắt đầu<input className="field min-w-0" type="datetime-local" required value={optionStart} onChange={(e) => setOptionStart(e.target.value)} /></label>
              <label className="grid gap-1 text-sm font-semibold">Kết thúc<input className="field min-w-0" type="datetime-local" required value={optionEnd} onChange={(e) => setOptionEnd(e.target.value)} /></label>
              <Button type="submit" variant="secondary" disabled={busy} className="self-end"><Plus size={16} /> Giờ</Button>
            </form>
            <form onSubmit={invite} aria-busy={busy} className="flex items-end gap-2">
              <label className="grid min-w-0 flex-1 gap-1 text-sm font-semibold">Tên người mời<input className="field min-w-0" value={inviteUsername} onChange={(e) => setInviteUsername(e.target.value)} placeholder="Username" required /></label>
              <Button type="submit" disabled={busy} aria-label="Gửi lời mời"><Send size={16} /></Button>
            </form>
          </div>
        )}
      </div>

      <div className="mt-5 border-t border-black/8 pt-5 dark:border-white/8">
        <p className="mb-3 flex items-center gap-2 text-sm font-bold"><MessageCircle size={16} /> Thảo luận</p>
        {!detailError && !detailLoading && <div className="space-y-2">
          {comments.map((comment) => (
            <div key={comment.id} className="rounded-2xl bg-[var(--soft)] p-3">
              <div className="flex items-center justify-between gap-3">
                <b className="text-sm">{comment.authorDisplayName}</b>
                <span className="text-xs text-[var(--muted)]">{new Date(comment.createdAt).toLocaleString("vi-VN")}</span>
              </div>
              <p className="mt-1 whitespace-pre-wrap text-sm leading-6">{comment.body}</p>
            </div>
          ))}
          {comments.length === 0 && <p className="text-sm text-[var(--muted)]">Chưa có tin nhắn nào.</p>}
        </div>}
        {item.status !== "canceled" && (
          <form onSubmit={postComment} aria-busy={busy} className="mt-3 flex items-end gap-2">
            <label className="grid min-w-0 flex-1 gap-1 text-sm font-semibold">Bình luận<input className="field min-w-0" value={commentBody} onChange={(e) => setCommentBody(e.target.value)} placeholder="Nhắn cho mọi người trong hoạt động…" maxLength={4000} /></label>
            <Button type="submit" disabled={busy || !commentBody.trim()} aria-label="Gửi bình luận"><Send size={16} /></Button>
          </form>
        )}
      </div>

      {error && <p role="alert" className="mt-3 text-sm text-[var(--danger)]">{error}</p>}
      {feedback && <p role="status" className="mt-3 text-sm text-[var(--success)]">{feedback}</p>}
    </Card>
  );
}

function statusLabel(status: MeetupListItem["status"]) {
  return ({ draft: "Nháp", proposed: "Đang đề xuất", confirmed: "Đã chốt", canceled: "Đã hủy", completed: "Đã xong" })[status];
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("vi-VN", { weekday: "short", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function formatRange(start: string, end: string) {
  return `${formatTime(start)} → ${new Intl.DateTimeFormat("vi-VN", { hour: "2-digit", minute: "2-digit" }).format(new Date(end))}`;
}

function humanize(error: unknown) {
  const text = error instanceof Error ? error.message
    : error && typeof error === "object" && "message" in error && typeof error.message === "string" ? error.message
    : "Thao tác không thành công. Hãy thử lại.";
  if (text.includes("capacity reached")) return "Hoạt động vừa đủ số người tham gia.";
  if (text.includes("user not found")) return "Không tìm thấy username này.";
  return text;
}

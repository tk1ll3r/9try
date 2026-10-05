import { CalendarCheck2, Check, Clock3, MessageCircle, Plus, Send, UsersRound, X, XCircle } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { useAuth } from "../../../bootstrap/AuthProvider";
import { groupsData, type GroupSummary } from "../../groups/infrastructure/GroupsData";
import { meetupsData, type MeetupComment, type MeetupListItem, type PollOption } from "../infrastructure/MeetupsData";
import { Button } from "../../../shared/ui/Button";
import { Card } from "../../../shared/ui/Card";

export function MeetupsPage() {
  const { user } = useAuth();
  const [items, setItems] = useState<MeetupListItem[]>([]);
  const [groups, setGroups] = useState<GroupSummary[]>([]);
  const [title, setTitle] = useState("");
  const [groupId, setGroupId] = useState("");
  const [description, setDescription] = useState("");
  const [capacity, setCapacity] = useState("");
  const [message, setMessage] = useState("");

  async function refresh() {
    if (!user) return;
    try {
      const [nextMeetups, nextGroups] = await Promise.all([meetupsData.list(user.id), groupsData.list(user.id)]);
      setItems(nextMeetups);
      setGroups(nextGroups);
      setMessage("");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không thể tải hoạt động.");
    }
  }

  useEffect(() => { void refresh(); }, [user?.id]);

  async function create(event: FormEvent) {
    event.preventDefault();
    try {
      await meetupsData.create({
        groupId: groupId || null,
        title,
        description,
        capacity: capacity ? Number(capacity) : null,
      });
      setTitle("");
      setDescription("");
      setCapacity("");
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Không thể tạo hoạt động.");
    }
  }

  return (
    <div className="space-y-5">
      <header>
        <p className="text-sm font-semibold text-[var(--muted)]">Đề xuất → bình chọn → chốt lịch</p>
        <h1 className="mt-1 text-4xl font-black tracking-[-.045em]">Hoạt động</h1>
      </header>

      <Card title="Đề xuất hoạt động">
        <form onSubmit={create} className="grid gap-3 md:grid-cols-2">
          <input className="field" value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ví dụ: Ăn tối cuối tuần" required />
          <select className="field" value={groupId} onChange={(e) => setGroupId(e.target.value)}>
            <option value="">Không gắn nhóm</option>
            {groups.map((group) => <option key={group.id} value={group.id}>{group.name}</option>)}
          </select>
          <textarea className="field min-h-24 md:col-span-2" value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Mô tả ngắn…" />
          <input className="field" type="number" min="1" value={capacity} onChange={(e) => setCapacity(e.target.value)} placeholder="Sức chứa (tùy chọn)" />
          <Button type="submit"><Plus size={17} /> Tạo đề xuất</Button>
        </form>
      </Card>

      {message && <div className="rounded-2xl bg-[var(--soft)] p-4 text-sm">{message}</div>}

      <div className="space-y-4">
        {items.length === 0
          ? <Card><p className="py-10 text-center text-[var(--muted)]">Chưa có hoạt động nào.</p></Card>
          : items.map((item) => <MeetupCard key={item.id} item={item} userId={user?.id ?? ""} onChanged={refresh} />)}
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

  async function loadDetails() {
    try {
      const [nextPoll, nextComments] = await Promise.all([
        meetupsData.poll(item.id),
        meetupsData.comments(item.id),
      ]);
      setPoll(nextPoll);
      setComments(nextComments);
    } catch {
      setPoll([]);
      setComments([]);
    }
  }

  useEffect(() => { void loadDetails(); }, [item.id]);

  async function respond(response: "going" | "maybe" | "declined") {
    try {
      await meetupsData.respond(item.id, response);
      await onChanged();
    } catch (e) {
      setError(humanize(e));
    }
  }

  async function invite(event: FormEvent) {
    event.preventDefault();
    try {
      await meetupsData.invite(item.id, inviteUsername);
      setInviteUsername("");
      setError("Đã gửi lời mời.");
    } catch (e) {
      setError(humanize(e));
    }
  }

  async function addOption(event: FormEvent) {
    event.preventDefault();
    try {
      await meetupsData.addOption(item.id, new Date(optionStart), new Date(optionEnd));
      setOptionStart("");
      setOptionEnd("");
      await loadDetails();
    } catch (e) {
      setError(humanize(e));
    }
  }

  async function postComment(event: FormEvent) {
    event.preventDefault();
    if (!commentBody.trim()) return;
    try {
      await meetupsData.postComment(item.id, commentBody.trim());
      setCommentBody("");
      await loadDetails();
    } catch (e) {
      setError(humanize(e));
    }
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
            <Button variant={item.rsvp === "going" ? "secondary" : "ghost"} onClick={() => void respond("going")}><Check size={16} /> Đi</Button>
            <Button variant={item.rsvp === "maybe" ? "secondary" : "ghost"} onClick={() => void respond("maybe")}>Có thể</Button>
            <Button variant="ghost" onClick={() => void respond("declined")}><X size={16} /> Không</Button>
          </div>
        )}

        {organizer && item.status !== "canceled" && item.status !== "completed" && (
          <Button variant="ghost" onClick={async () => { await meetupsData.cancel(item.id); await onChanged(); }}><XCircle size={16} /> Hủy hoạt động</Button>
        )}
      </div>

      <div className="mt-5 border-t border-black/8 pt-5 dark:border-white/8">
        <p className="mb-3 text-sm font-bold">Bình chọn thời gian</p>
        {poll.length === 0 ? <p className="text-sm text-[var(--muted)]">Chưa có khung giờ nào được đề xuất.</p> : (
          <div className="space-y-2">
            {poll.map((option) => (
              <div key={option.optionId} className="flex flex-col gap-2 rounded-2xl bg-[var(--soft)] p-3 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold">{formatRange(option.startsAt, option.endsAt)}</p>
                  <p className="text-xs text-[var(--muted)]">{option.availableCount}/{option.totalVotes || 0} người đã chọn rảnh</p>
                </div>
                <div className="flex gap-2">
                  <Button variant={option.myVote === true ? "secondary" : "ghost"} className="px-3" onClick={async () => { await meetupsData.vote(option.optionId, true); await loadDetails(); }}>Rảnh</Button>
                  <Button variant={option.myVote === false ? "secondary" : "ghost"} className="px-3" onClick={async () => { await meetupsData.vote(option.optionId, false); await loadDetails(); }}>Bận</Button>
                  {organizer && <Button className="px-3" onClick={async () => { await meetupsData.confirm(item.id, option.optionId); await onChanged(); }}><CalendarCheck2 size={15} /> Chốt</Button>}
                </div>
              </div>
            ))}
          </div>
        )}

        {organizer && item.status !== "canceled" && item.status !== "completed" && (
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            <form onSubmit={addOption} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
              <input className="field" type="datetime-local" required value={optionStart} onChange={(e) => setOptionStart(e.target.value)} />
              <input className="field" type="datetime-local" required value={optionEnd} onChange={(e) => setOptionEnd(e.target.value)} />
              <Button type="submit" variant="secondary"><Plus size={16} /> Giờ</Button>
            </form>
            <form onSubmit={invite} className="flex gap-2">
              <input className="field min-w-0 flex-1" value={inviteUsername} onChange={(e) => setInviteUsername(e.target.value)} placeholder="Mời bằng username" required />
              <Button type="submit" aria-label="Gửi lời mời"><Send size={16} /></Button>
            </form>
          </div>
        )}
      </div>

      <div className="mt-5 border-t border-black/8 pt-5 dark:border-white/8">
        <p className="mb-3 flex items-center gap-2 text-sm font-bold"><MessageCircle size={16} /> Thảo luận</p>
        <div className="space-y-2">
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
        </div>
        {item.status !== "canceled" && (
          <form onSubmit={postComment} className="mt-3 flex gap-2">
            <input className="field min-w-0 flex-1" value={commentBody} onChange={(e) => setCommentBody(e.target.value)} placeholder="Nhắn cho mọi người trong hoạt động…" maxLength={4000} />
            <Button type="submit" aria-label="Gửi bình luận"><Send size={16} /></Button>
          </form>
        )}
      </div>

      {error && <p className="mt-3 text-sm text-[var(--muted)]">{error}</p>}
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
  const text = error instanceof Error ? error.message : String(error);
  if (text.includes("capacity reached")) return "Hoạt động vừa đủ số người tham gia.";
  if (text.includes("user not found")) return "Không tìm thấy username này.";
  return text;
}

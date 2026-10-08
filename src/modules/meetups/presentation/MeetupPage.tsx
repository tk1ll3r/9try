import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, CalendarCheck2, Check, Clock3, MessageCircle, Plus, Send, UsersRound, X, XCircle } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { errorMessage } from "../../../kernel/errors";
import { useModule, useUserId } from "../../../kernel/session";
import { useAction } from "../../../kernel/useAction";
import { Button } from "../../../kernel/ui/Button";
import { Card } from "../../../kernel/ui/Card";
import { useConfirm } from "../../../kernel/ui/Confirm";
import { PeoplePicker } from "../../friends";
import { MeetupPolicy, type MeetupSummary } from "../domain/Meetup";
import { meetupsModule } from "../meetups.module";
import { formatRange, formatTime, meetupsKey, rsvpLabel, statusLabel } from "./labels";
import { locale, t } from "../../../kernel/i18n";

/** One meetup: who is invited, the time poll, invitations and the discussion. */
export function MeetupPage() {
  const { meetupId } = useParams();
  const meetups = useModule(meetupsModule);
  const list = useQuery({ queryKey: [...meetupsKey, "list"], queryFn: () => meetups.list() });
  const item = list.data?.find(meetup => meetup.id === meetupId);

  return <div className="space-y-5">
    <Link to="/meetups" className="inline-flex min-h-11 items-center gap-2 text-sm font-semibold underline"><ArrowLeft size={16} /> {t("Tất cả hoạt động")}</Link>
    {list.isPending && <p role="status">{t("Đang tải hoạt động…")}</p>}
    {list.isError && <div role="alert" className="rounded-2xl bg-[var(--soft)] p-4 text-sm text-[var(--danger)]">{errorMessage(list.error, t("Không thể tải hoạt động."))} <Button variant="ghost" disabled={list.isFetching} onClick={() => void list.refetch()}>{t("Thử tải lại")}</Button></div>}
    {list.isSuccess && !item && <Card><p className="py-10 text-center text-[var(--muted)]">{t("Không thấy hoạt động này. Có thể bạn không được mời, hoặc nó đã bị xóa.")}</p></Card>}
    {item && <MeetupDetail key={item.id} item={item} />}
  </div>;
}

function MeetupDetail({ item }: { item: MeetupSummary }) {
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
  const confirm = useConfirm();
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
    if (!Number.isFinite(start.getTime()) || !Number.isFinite(end.getTime()) || end <= start) { setNotice({ text: t("Giờ kết thúc phải sau giờ bắt đầu."), failed: true }); return; }
    setNotice(null);
    inside.run(() => meetups.addOption(item.id, start, end), () => { setOptionStart(""); setOptionEnd(""); });
  }
  function invite(event: FormEvent) {
    event.preventDefault();
    setNotice(null);
    if (inviteIds.length) inside.run(() => meetups.invite(item.id, inviteIds), () => { setInviteIds([]); setNotice({ text: t("Đã gửi lời mời."), failed: false }); });
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
            <h1 className="text-2xl font-black tracking-tight">{item.title}</h1>
            <span className="rounded-full bg-[var(--soft)] px-2.5 py-1 text-xs font-bold">{statusLabel[item.status]}</span>
          </div>
          {item.description && <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{item.description}</p>}
          <div className="mt-3 flex flex-wrap gap-3 text-xs font-semibold text-[var(--muted)]">
            <span className="inline-flex items-center gap-1"><UsersRound size={14} /> {item.capacity ? t("Tối đa {0}", item.capacity) : t("Không giới hạn")}</span>
            <span className="inline-flex items-center gap-1"><Clock3 size={14} /> {item.startAt ? formatTime(item.startAt) : t("Chưa chốt giờ")}</span>
            {item.locationName && <span>{item.locationName}</span>}
          </div>
        </div>

        {policy.canRespond && (
          <div className="flex flex-wrap gap-2">
            <Button disabled={busy} aria-pressed={item.rsvp === "going"} variant={item.rsvp === "going" ? "secondary" : "ghost"} onClick={() => whole.run(() => meetups.respond(item.id, "going"))}><Check size={16} /> {t("Đi")}</Button>
            <Button disabled={busy} aria-pressed={item.rsvp === "maybe"} variant={item.rsvp === "maybe" ? "secondary" : "ghost"} onClick={() => whole.run(() => meetups.respond(item.id, "maybe"))}>{t("Có thể")}</Button>
            <Button disabled={busy} aria-pressed={item.rsvp === "declined"} variant={item.rsvp === "declined" ? "secondary" : "ghost"} onClick={() => whole.run(() => meetups.respond(item.id, "declined"))}><X size={16} /> {t("Không")}</Button>
          </div>
        )}
        {policy.canCancel && (
          <Button variant="ghost" disabled={busy} onClick={async () => {
            if (await confirm({ title: t("Hủy hoạt động?"), body: t("“{0}” sẽ bị hủy. Người được mời sẽ không tham gia được nữa.", item.title), action: t("Hủy hoạt động") })) whole.run(() => meetups.cancel(item.id));
          }}><XCircle size={16} /> {t("Hủy hoạt động")}</Button>
        )}
      </div>

      {!!detail.data?.participants.length && (
        <ul aria-label={t("Người được mời")} className="mt-4 flex flex-wrap gap-2">
          {detail.data.participants.map(person => <li key={person.userId} className="rounded-full bg-[var(--soft)] px-3 py-1.5 text-xs font-semibold">{person.displayName} · {rsvpLabel[person.rsvp]}</li>)}
        </ul>
      )}

      <div className="mt-5 border-t border-black/8 pt-5 dark:border-white/8">
        <p className="mb-3 text-sm font-bold">{t("Bình chọn thời gian")}</p>
        {detail.isPending && <p role="status" className="text-sm text-[var(--muted)]">{t("Đang tải bình chọn và thảo luận…")}</p>}
        {detail.isError && <p role="alert" className="text-sm text-[var(--danger)]">{t("Không tải được chi tiết:")} {errorMessage(detail.error, t("hãy thử lại."))} <Button variant="ghost" disabled={detail.isFetching} onClick={() => void detail.refetch()}>{t("Thử lại")}</Button></p>}
        {detail.isSuccess && (detail.data.poll.length === 0 ? <p className="text-sm text-[var(--muted)]">{t("Chưa có khung giờ nào được đề xuất.")}</p> : (
          <div className="space-y-2">
            {detail.data.poll.map(option => (
              <div key={option.optionId} className="flex flex-col gap-2 rounded-2xl bg-[var(--soft)] p-3 sm:flex-row sm:items-center">
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold">{formatRange(option.startsAt, option.endsAt)}</p>
                  <p className="text-xs text-[var(--muted)]">{t("{0}/{1} người đã chọn rảnh", option.availableCount, option.totalVotes)}</p>
                </div>
                <div className="flex gap-2">
                  <Button disabled={busy} aria-pressed={option.myVote === true} variant={option.myVote === true ? "secondary" : "ghost"} className="px-3" onClick={() => inside.run(() => meetups.vote(option.optionId, true))}>{t("Rảnh")}</Button>
                  <Button disabled={busy} aria-pressed={option.myVote === false} variant={option.myVote === false ? "secondary" : "ghost"} className="px-3" onClick={() => inside.run(() => meetups.vote(option.optionId, false))}>{t("Bận")}</Button>
                  {policy.canPlan && <Button disabled={busy} className="px-3" onClick={() => whole.run(() => meetups.confirm(item.id, option.optionId))}><CalendarCheck2 size={15} /> {t("Chốt")}</Button>}
                </div>
              </div>
            ))}
          </div>
        ))}

        {policy.canPlan && (
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            <form onSubmit={addOption} aria-busy={busy} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
              <label className="grid gap-1 text-sm font-semibold">{t("Bắt đầu")}<input className="field min-w-0" type="datetime-local" required value={optionStart} onChange={event => setOptionStart(event.target.value)} /></label>
              <label className="grid gap-1 text-sm font-semibold">{t("Kết thúc")}<input className="field min-w-0" type="datetime-local" required value={optionEnd} onChange={event => setOptionEnd(event.target.value)} /></label>
              <Button type="submit" variant="secondary" disabled={busy} className="self-end"><Plus size={16} /> {t("Giờ")}</Button>
            </form>
            <form onSubmit={invite} aria-busy={busy} className="space-y-2">
              <PeoplePicker legend={t("Mời thêm bạn bè")} value={inviteIds} onChange={setInviteIds} />
              <Button type="submit" disabled={busy || !inviteIds.length}><Send size={16} /> {t("Gửi lời mời")}</Button>
            </form>
          </div>
        )}
      </div>

      <div className="mt-5 border-t border-black/8 pt-5 dark:border-white/8">
        <p className="mb-3 flex items-center gap-2 text-sm font-bold"><MessageCircle size={16} /> {t("Thảo luận")}</p>
        {detail.isSuccess && <div className="space-y-2">
          {detail.data.comments.map(comment => (
            <div key={comment.id} className="rounded-2xl bg-[var(--soft)] p-3">
              <div className="flex items-center justify-between gap-3">
                <b className="text-sm">{comment.authorDisplayName}</b>
                <span className="text-xs text-[var(--muted)]">{new Date(comment.createdAt).toLocaleString(locale)}</span>
              </div>
              <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6">{comment.body}</p>
            </div>
          ))}
          {detail.data.comments.length === 0 && <p className="text-sm text-[var(--muted)]">{t("Chưa có tin nhắn nào.")}</p>}
        </div>}
        {policy.canComment && (
          <form onSubmit={postComment} aria-busy={busy} className="mt-3 flex items-end gap-2">
            <label className="grid min-w-0 flex-1 gap-1 text-sm font-semibold">{t("Bình luận")}<input className="field min-w-0" value={commentBody} onChange={event => setCommentBody(event.target.value)} placeholder={t("Nhắn cho mọi người trong hoạt động…")} maxLength={4000} /></label>
            <Button type="submit" disabled={busy || !commentBody.trim()} aria-label={t("Gửi bình luận")}><Send size={16} /></Button>
          </form>
        )}
      </div>

      {error && <p role="alert" className="mt-3 text-sm text-[var(--danger)]">{error}</p>}
      {notice && !notice.failed && <p role="status" className="mt-3 text-sm text-[var(--success)]">{notice.text}</p>}
    </Card>
  );
}

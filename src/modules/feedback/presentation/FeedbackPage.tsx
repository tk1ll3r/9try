import { Check, Inbox, Send } from "lucide-react";
import { useState, type FormEvent } from "react";
import { errorMessage } from "../../../kernel/errors";
import { locale, t } from "../../../kernel/i18n";
import { useAction } from "../../../kernel/useAction";
import { useModule } from "../../../kernel/session";
import { Avatar } from "../../../kernel/ui/Avatar";
import { Button } from "../../../kernel/ui/Button";
import { Card } from "../../../kernel/ui/Card";
import { feedbackModule } from "../feedback.module";
import { useFeedbackInbox, useFeedbackRecipient, feedbackKey } from "./useFeedback";

export function FeedbackPage() {
  const feedback = useModule(feedbackModule);
  const recipient = useFeedbackRecipient();
  const inbox = useFeedbackInbox(recipient.data === true);
  const { run, pending, error } = useAction(feedbackKey);
  const [message, setMessage] = useState("");
  const [notice, setNotice] = useState("");

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const cleaned = message.trim();
    if (!cleaned) return;
    run(() => feedback.submit(cleaned), () => {
      setMessage("");
      setNotice(t("Đã gửi góp ý đến admin tk1ll3r."));
    });
  }

  function markRead(id: string) {
    run(() => feedback.markRead(id), () => setNotice(t("Đã đánh dấu góp ý là đã đọc.")));
  }

  const loadProblem = recipient.isError ? errorMessage(recipient.error, t("Chưa kiểm tra được tài khoản nhận góp ý."))
    : inbox.isError ? errorMessage(inbox.error, t("Chưa tải được hộp thư góp ý.")) : "";

  return <div className="mx-auto max-w-3xl space-y-5">
    <header className="space-y-2">
      <div className="grid size-12 place-items-center rounded-2xl bg-[var(--lime)] text-[var(--ink)]"><Send size={21} /></div>
      <p className="text-sm font-semibold text-[var(--muted)]">{t("Giúp app tốt hơn mỗi ngày")}</p>
      <h1 className="text-3xl font-black tracking-tight sm:text-4xl">{recipient.data ? t("Hộp thư góp ý") : t("Góp ý với admin")}</h1>
      <p className="text-sm leading-6 text-[var(--muted)]">{t("Góp ý sẽ được gửi riêng đến tài khoản @tk1ll3r. Chỉ admin mới đọc được nội dung.")}</p>
    </header>

    {loadProblem && <p role="alert" className="rounded-2xl bg-[var(--soft)] p-4 text-sm text-[var(--danger)]">{loadProblem} <Button variant="ghost" disabled={recipient.isFetching || inbox.isFetching} onClick={() => recipient.data ? void inbox.refetch() : void recipient.refetch()}>{t("Thử tải lại")}</Button></p>}
    {error && <p role="alert" className="rounded-2xl bg-[var(--soft)] p-4 text-sm text-[var(--danger)]">{error}</p>}
    {notice && <p role="status" className="rounded-2xl bg-[var(--soft)] p-4 text-sm font-semibold">{notice}</p>}

    {recipient.isPending && <p role="status" className="text-sm text-[var(--muted)]">{t("Đang kiểm tra tài khoản…")}</p>}

    {recipient.data === true ? <Card title={t("Góp ý đã nhận · {0}", inbox.data?.length ?? 0)}>
      {inbox.isPending ? <p role="status">{t("Đang tải góp ý…")}</p> : inbox.data?.length ? <ul className="divide-y divide-[var(--border)]">
        {inbox.data.map(item => <li key={item.id} className="flex gap-3 py-4">
          <Avatar name={item.senderName} src={item.senderAvatarUrl} className="size-11 shrink-0 bg-[var(--soft)] font-black" />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              <b className="truncate">{item.senderName}{item.senderUsername ? <span className="ml-1 font-normal text-[var(--muted)]">@{item.senderUsername}</span> : null}</b>
              <time className="text-xs text-[var(--muted)]" dateTime={item.createdAt}>{new Date(item.createdAt).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" })}</time>
            </div>
            <p className="mt-2 whitespace-pre-wrap break-words text-sm leading-6">{item.message}</p>
          </div>
          {!item.readAt && <button type="button" aria-label={t("Đánh dấu góp ý của {0} đã đọc", item.senderName)} disabled={pending} onClick={() => markRead(item.id)} className="grid size-11 shrink-0 place-items-center self-start rounded-xl text-[var(--muted)] hover:bg-[var(--soft)] hover:text-[var(--ink)]"><Check size={18} /></button>}
        </li>)}
      </ul> : <div className="py-10 text-center text-[var(--muted)]"><Inbox className="mx-auto mb-2" size={26} />{t("Chưa có góp ý nào.")}</div>}
    </Card> : <Card title={t("Gửi góp ý")}>
      <form className="space-y-3" onSubmit={submit}>
        <label htmlFor="admin-feedback-message" className="block text-sm font-semibold">{t("Nội dung góp ý")}</label>
        <textarea id="admin-feedback-message" className="field min-h-40 w-full resize-y" value={message} onChange={event => setMessage(event.target.value)} placeholder={t("Chia sẻ lỗi bạn gặp hoặc điều bạn muốn app cải thiện…")} maxLength={3000} required />
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-xs text-[var(--muted)]">{t("{0}/3000 ký tự", message.length)}</span>
          <Button type="submit" disabled={pending || !message.trim()}><Send size={17} /> {pending ? t("Đang gửi…") : t("Gửi đến tk1ll3r")}</Button>
        </div>
      </form>
    </Card>}
  </div>;
}

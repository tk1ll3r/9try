import { useInfiniteQuery, useMutation, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { Bell, Check, Settings } from "lucide-react";
import { Link, useNavigate } from "react-router-dom";
import { errorMessage } from "../../../kernel/errors";
import { useModule, useRegistry } from "../../../kernel/session";
import { Button } from "../../../kernel/ui/Button";
import { Card } from "../../../kernel/ui/Card";
import { notificationTarget, type AppNotification } from "../domain/Notification";
import { notificationsModule } from "../notifications.module";
import { unreadKey } from "./UnreadBadge";

const pageSize = 20;
const listKey = ["notifications", "list"] as const;

export function NotificationsPage() {
  const { inbox } = useModule(notificationsModule);
  const { safePath } = useRegistry();
  const navigate = useNavigate();
  const queries = useQueryClient();

  const list = useInfiniteQuery({
    queryKey: listKey,
    queryFn: ({ pageParam }) => inbox.list(pageParam, pageSize),
    initialPageParam: 0,
    getNextPageParam: (last, pages) => last.length === pageSize ? pages.length * pageSize : undefined,
  });
  const items = list.data?.pages.flat() ?? [];

  const open = useMutation({
    mutationFn: async (item: AppNotification) => {
      if (!item.readAt) await inbox.markRead(item.id);
      return item;
    },
    onSuccess: item => {
      queries.setQueryData<InfiniteData<AppNotification[]>>(listKey, data => data && {
        ...data,
        pages: data.pages.map(page => page.map(row => row.id === item.id ? { ...row, readAt: row.readAt ?? new Date().toISOString() } : row)),
      });
      void queries.invalidateQueries({ queryKey: unreadKey });
      const target = notificationTarget(item.actionPath, safePath);
      if (target) navigate(target);
    },
  });

  const readAll = useMutation({
    mutationFn: () => inbox.markAllRead(),
    onSuccess: () => {
      const now = new Date().toISOString();
      queries.setQueryData<InfiniteData<AppNotification[]>>(listKey, data => data && { ...data, pages: data.pages.map(page => page.map(row => ({ ...row, readAt: row.readAt ?? now }))) });
      void queries.invalidateQueries({ queryKey: unreadKey });
    },
  });

  const listProblem = open.isError ? errorMessage(open.error, "Không thể mở thông báo.")
    : list.isError ? errorMessage(list.error, "Không thể tải thông báo.") : "";

  return (
    <div className="space-y-5">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-[var(--muted)]">Những gì cần bạn biết</p>
          <h1 className="mt-1 text-4xl font-black tracking-[-.045em]">Thông báo</h1>
        </div>
        <Link to="/me/settings" className="inline-flex min-h-11 items-center gap-2 rounded-2xl px-3 text-sm font-semibold text-[var(--muted)] hover:bg-[var(--soft)]"><Settings size={17} /> Cài đặt thông báo đẩy</Link>
      </header>

      <Card title={`Trung tâm thông báo · ${items.filter((item) => !item.readAt).length} chưa đọc`}
        action={items.some(item => !item.readAt) ? <Button variant="ghost" disabled={readAll.isPending} onClick={() => readAll.mutate()}><Check size={16} /> Đánh dấu đã đọc hết</Button> : undefined}>
        {readAll.isError && <p role="alert" className="mb-3 text-sm text-[var(--danger)]">{errorMessage(readAll.error, "Chưa đánh dấu được. Hãy thử lại.")}</p>}
        {listProblem && <p role="alert" className="mb-3 text-sm text-[var(--danger)]">{listProblem} <Button variant="ghost" disabled={list.isFetching}
          onClick={() => void (list.isFetchNextPageError ? list.fetchNextPage() : list.refetch())}>Thử lại</Button></p>}
        {list.isPending && <p role="status">Đang tải thông báo…</p>}
        {items.length ? (
          <div className="divide-y divide-black/8 dark:divide-white/8">
            {items.map((item) => (
              <button
                key={item.id}
                onClick={() => open.mutate(item)}
                disabled={open.isPending}
                aria-label={`${item.title}. ${notificationTarget(item.actionPath, safePath) ? "Mở nội dung" : "Đánh dấu đã đọc"}`}
                className="flex w-full gap-3 py-4 text-left disabled:opacity-60"
              >
                <span className={`mt-1.5 size-2 shrink-0 rounded-full ${item.readAt ? "bg-black/10 dark:bg-white/10" : "bg-[var(--lime-strong)]"}`} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-start justify-between gap-3">
                    <b>{item.title}</b>
                    <span className="shrink-0 text-xs text-[var(--muted)]">
                      {new Date(item.createdAt).toLocaleString("vi-VN")}
                    </span>
                  </span>
                  <span className="mt-1 block text-sm leading-6 text-[var(--muted)]">{item.body}</span>
                </span>
                {item.readAt && <Check size={16} className="mt-1 text-[var(--muted)]" />}
              </button>
            ))}
          </div>
        ) : !list.isPending && !listProblem ? (
          <div className="py-12 text-center text-[var(--muted)]">
            <Bell className="mx-auto mb-2" />
            Chưa có thông báo mới.
          </div>
        ) : null}
        {list.hasNextPage && <Button className="mt-3" variant="ghost" disabled={list.isFetchingNextPage} onClick={() => void list.fetchNextPage()}>{list.isFetchingNextPage ? "Đang tải…" : "Xem thêm"}</Button>}
      </Card>
    </div>
  );
}

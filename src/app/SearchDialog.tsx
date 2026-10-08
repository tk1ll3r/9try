import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useRegistry, useSearchItems } from "../kernel/session";
import { matchesSearch } from "../kernel/text";
import { DialogPanel } from "../kernel/ui/DialogPanel";
import { t } from "../kernel/i18n";

/** Finds screens and whatever the modules offer through `searchItems`. Enter opens the first result. */
export function SearchDialog({ open, onOpenChange }: { open: boolean; onOpenChange(open: boolean): void }) {
  const load = useSearchItems();
  const { navigation } = useRegistry();
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  // Loaded when the dialog opens and kept for half a minute; typing only filters what is already here.
  const items = useQuery({ queryKey: ["search"], queryFn: load, enabled: open, staleTime: 30_000 });
  const all = [...navigation.map(item => ({ title: item.label, kind: t("Màn hình"), to: item.to, keywords: "" })), ...(items.data ?? [])];
  const found = query.trim() ? all.filter(item => matchesSearch(`${item.title} ${item.keywords ?? ""}`, query)).slice(0, 30) : [];

  function go(to: string) {
    onOpenChange(false);
    setQuery("");
    navigate(to);
  }

  return <DialogPanel open={open} onOpenChange={onOpenChange} title={t("Tìm kiếm")} description={t("Tìm việc, ghi chú, sự kiện, bạn bè, nhóm, cuộc trò chuyện và màn hình. Gõ không dấu cũng được.")}>
    <form onSubmit={event => { event.preventDefault(); if (found[0]) go(found[0].to); }}>
      <input data-dialog-initial-focus type="search" className="field w-full" aria-label={t("Từ khóa")} placeholder={t("Bạn tìm gì?")} value={query} onChange={event => setQuery(event.target.value)} />
    </form>
    <ul aria-label={t("Kết quả")} className="mt-3 space-y-1">
      {found.map((item, index) => <li key={index}>
        <button type="button" onClick={() => go(item.to)} className="flex min-h-11 w-full items-center justify-between gap-3 rounded-xl px-3 text-left hover:bg-[var(--soft)]">
          <span className="min-w-0 truncate font-semibold">{item.title}</span>
          <span className="shrink-0 text-xs text-[var(--muted)]">{item.kind}</span>
        </button>
      </li>)}
    </ul>
    {query.trim() && !found.length && <p role="status" className="mt-3 text-sm text-[var(--muted)]">{items.isPending ? t("Đang tìm…") : t("Không thấy gì khớp.")}</p>}
  </DialogPanel>;
}

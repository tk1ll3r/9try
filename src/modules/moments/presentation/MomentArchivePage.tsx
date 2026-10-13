import { ArrowLeft, Download, Images, Trash2 } from "lucide-react";
import { useState } from "react";
import { Link } from "react-router-dom";
import { errorMessage } from "../../../kernel/errors";
import { warmImages } from "../../../kernel/warmImages";
import { useModule } from "../../../kernel/session";
import { useAction } from "../../../kernel/useAction";
import { Avatar } from "../../../kernel/ui/Avatar";
import { Button } from "../../../kernel/ui/Button";
import { DialogPanel } from "../../../kernel/ui/DialogPanel";
import { useConfirm } from "../../../kernel/ui/Confirm";
import type { ArchivedMoment } from "../domain/Moment";
import { momentsModule } from "../moments.module";
import { momentsKey, useMomentArchive, usePhotoAddresses } from "./useMoments";
import { locale, t } from "../../../kernel/i18n";

/** Photos that remain after their 24-hour stories finish, with the same audience and photographer attribution. */
export function MomentArchivePage() {
  const repository = useModule(momentsModule);
  const confirm = useConfirm();
  const archive = useMomentArchive();
  const { run, pending, error } = useAction(momentsKey);
  const [selected, setSelected] = useState<ArchivedMoment | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  const [downloadError, setDownloadError] = useState("");
  const pages = archive.data?.pages ?? [];
  const photos = pages.flatMap(page => page.items);
  const addresses = usePhotoAddresses(photos.map(photo => photo.path));

  async function remove(photo: ArchivedMoment) {
    if (!await confirm({ title: t("Xóa ảnh đã lưu?"), body: t("Ảnh sẽ bị xóa khỏi kho lưu trữ và không còn xem được."), action: t("Xóa ảnh") })) return;
    run(() => repository.remove(photo.id), () => { if (selected?.id === photo.id) setSelected(null); });
  }

  async function download(photo: ArchivedMoment) {
    setDownloadingId(photo.id);
    setDownloadError("");
    try {
      const blob = await repository.download(photo.path);
      const address = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = address;
      link.download = `gnouht-photo-${photo.id}.jpg`;
      link.style.display = "none";
      document.body.append(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(address), 60_000);
    } catch {
      setDownloadError(t("Không tải được ảnh về máy. Hãy thử lại."));
    } finally {
      setDownloadingId(null);
    }
  }

  return <div className="mx-auto max-w-6xl space-y-5">
    <header className="flex items-center gap-3">
      <Link to="/" aria-label={t("Về Mode")} className="grid size-11 shrink-0 place-items-center rounded-xl hover:bg-[var(--soft)]"><ArrowLeft size={18} /></Link>
      <div className="min-w-0 flex-1"><h1 className="text-3xl font-black tracking-tight">{t("Kho ảnh đã lưu")}</h1><p className="mt-1 text-sm text-[var(--muted)]">{t("Ảnh được lưu vào đây ngay khi đăng. Story vẫn chỉ hiện trong 24 giờ, cùng người chụp và quyền xem ban đầu.")}</p></div>
      <Images className="hidden text-[var(--lime-strong)] sm:block" size={25} />
    </header>

    {(archive.isError || error) && <p role="alert" className="rounded-2xl bg-[var(--soft)] p-4 text-sm text-[var(--danger)]">{error || errorMessage(archive.error, t("Chưa tải được kho ảnh."))} <Button variant="ghost" disabled={archive.isFetching} onClick={() => void archive.refetch()}>{t("Thử tải lại")}</Button></p>}
    {archive.isPending && <div role="status" aria-label={t("Đang tải ảnh")} className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">{Array.from({ length: 8 }, (_, index) => <div key={index} className="skeleton aspect-[4/5]" />)}</div>}

    {archive.isSuccess && !photos.length && <div className="rounded-3xl border border-dashed border-[var(--border)] p-8 text-center">
      <Images size={30} className="mx-auto text-[var(--muted)]" />
      <p className="mt-3 font-bold">{t("Kho ảnh đang trống")}</p>
      <p className="mt-1 text-sm text-[var(--muted)]">{t("Ảnh bạn đăng sẽ được lưu tại đây ngay, kể cả khi story vẫn đang hiện trong 24 giờ.")}</p>
    </div>}

    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
      {photos.map((photo, index) => <article key={photo.id} className="overflow-hidden rounded-3xl border border-[var(--border)] bg-[var(--surface)] shadow-sm">
        <button type="button" onPointerDown={() => warmImages([addresses.get(photo.path) ?? ""])} onClick={() => { setDownloadError(""); setSelected(photo); }} className="group relative block aspect-[4/5] w-full overflow-hidden bg-[var(--soft)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--focus)]" aria-label={t("Mở ảnh của {0}", photo.ownerName)}>
          {addresses.get(photo.path) ? <img src={addresses.get(photo.path)} alt={photo.caption || t("Ảnh của {0}", photo.ownerName)} loading={index < 6 ? "eager" : "lazy"} fetchPriority={index < 2 ? "high" : "auto"} decoding="async" className="size-full object-cover transition-transform duration-300 group-hover:scale-[1.03]" /> : <span className="skeleton absolute inset-0 !rounded-none" />}
          {photo.caption && <span className="absolute inset-x-0 bottom-0 line-clamp-2 bg-gradient-to-t from-black/75 to-transparent px-3 pb-3 pt-8 text-left text-sm font-semibold text-white">{photo.caption}</span>}
        </button>
        <div className="flex items-center gap-2 p-3">
          <Avatar name={photo.ownerName} src={photo.ownerAvatarUrl} className="size-9 shrink-0 bg-[var(--soft)] text-xs font-black" />
          <div className="min-w-0 flex-1">
            <b className="block truncate text-sm">{photo.ownerName}{photo.mine ? ` · ${t("Bạn")}` : ""}</b>
            <time className="block truncate text-xs text-[var(--muted)]" dateTime={photo.createdAt}>{new Date(photo.createdAt).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" })}</time>
          </div>
          {photo.mine && <button type="button" aria-label={t("Xóa ảnh của {0}", photo.ownerName)} disabled={pending} onClick={() => void remove(photo)} className="grid size-10 shrink-0 place-items-center rounded-xl text-[var(--muted)] hover:bg-[var(--soft)] hover:text-[var(--danger)]"><Trash2 size={17} /></button>}
        </div>
      </article>)}
    </div>

    {archive.hasNextPage && <div className="text-center"><Button variant="secondary" disabled={archive.isFetchingNextPage} onClick={() => void archive.fetchNextPage()}>{archive.isFetchingNextPage ? t("Đang tải thêm…") : t("Tải thêm ảnh")}</Button></div>}

    <DialogPanel open={!!selected} onOpenChange={open => { if (!open) { setSelected(null); setDownloadError(""); } }} title={selected ? t("Ảnh của {0}", selected.ownerName) : t("Ảnh đã lưu")} description={selected ? t("Người chụp: {0} · {1}", selected.ownerName, new Date(selected.createdAt).toLocaleString(locale, { dateStyle: "medium", timeStyle: "short" })) : ""} size="lg">
      {selected && <div className="mx-auto max-w-3xl space-y-3">
        <div className="flex items-center gap-3"><Avatar name={selected.ownerName} src={selected.ownerAvatarUrl} className="size-11 shrink-0 bg-[var(--soft)] font-black" /><div><b>{selected.ownerName}{selected.mine ? ` · ${t("Bạn")}` : ""}</b><p className="text-xs text-[var(--muted)]">{selected.audience === "friends" ? t("Đã chia sẻ với bạn bè") : t("Đã chia sẻ với những người được chọn")}</p></div></div>
        {addresses.get(selected.path) ? <img src={addresses.get(selected.path)} alt={selected.caption || t("Ảnh của {0}", selected.ownerName)} className="mx-auto max-h-[62dvh] w-auto max-w-full rounded-2xl object-contain" /> : <div role="status" aria-label={t("Đang tải ảnh")} className="skeleton mx-auto aspect-[4/5] max-h-[62dvh]" />}
        {selected.caption && <p className="whitespace-pre-wrap break-words leading-6">{selected.caption}</p>}
        {downloadError && <p role="alert" className="text-sm text-[var(--danger)]">{downloadError}</p>}
        <div className="flex flex-wrap gap-2">
          <Button variant="secondary" disabled={pending || downloadingId !== null} onClick={() => void download(selected)}>
            <Download size={17} /> {downloadingId === selected.id ? t("Đang tải ảnh về máy…") : t("Tải ảnh về máy")}
          </Button>
          {selected.mine && <Button variant="danger" disabled={pending || downloadingId === selected.id} onClick={() => void remove(selected)}><Trash2 size={17} /> {t("Xóa ảnh")}</Button>}
        </div>
      </div>}
    </DialogPanel>
  </div>;
}

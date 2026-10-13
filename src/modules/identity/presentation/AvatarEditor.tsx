import { useEffect, useRef, useState, type PointerEvent } from "react";
import { Button } from "../../../kernel/ui/Button";
import { DialogPanel } from "../../../kernel/ui/DialogPanel";
import { avatarMaxLength, avatarSide, cropSquare } from "../domain/avatar";
import { t } from "../../../kernel/i18n";

/** The side of the preview, in CSS pixels. */
const preview = 240;

/**
 * Cuts a chosen photo to the square that becomes the profile picture. The photo is read and cut on
 * this device; only the small result is given to `onDone`, as an inline JPEG. Drag the picture or
 * use the sliders, which also work from a keyboard.
 */
export function AvatarEditor({ file, onDone, onCancel }: { file: File; onDone(picture: string): void; onCancel(): void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [image, setImage] = useState<HTMLImageElement>();
  const [failed, setFailed] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [x, setX] = useState(0.5);
  const [y, setY] = useState(0.5);
  const drag = useRef<{ atX: number; atY: number } | null>(null);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    const picture = new Image();
    picture.onload = () => setImage(picture);
    picture.onerror = () => setFailed(true);
    picture.src = url;
    // A photo that is dropped while it loads must not report a failure for the one that replaces it.
    return () => { picture.onload = picture.onerror = null; URL.revokeObjectURL(url); };
  }, [file]);

  const crop = image ? cropSquare(image.naturalWidth, image.naturalHeight, zoom, x, y) : undefined;
  useEffect(() => {
    const context = canvas.current?.getContext("2d");
    if (context && image && crop) context.drawImage(image, crop.left, crop.top, crop.side, crop.side, 0, 0, preview * 2, preview * 2);
  }, [image, zoom, x, y]);

  // Dragging moves the picture under the frame, so the frame goes the other way across the picture.
  function move(event: PointerEvent) {
    if (!drag.current || !image || !crop) return;
    const perPixel = crop.side / event.currentTarget.getBoundingClientRect().width;
    const free = { x: image.naturalWidth - crop.side, y: image.naturalHeight - crop.side };
    if (free.x > 0) setX(value => Math.min(1, Math.max(0, value - (event.clientX - drag.current!.atX) * perPixel / free.x)));
    if (free.y > 0) setY(value => Math.min(1, Math.max(0, value - (event.clientY - drag.current!.atY) * perPixel / free.y)));
    drag.current = { atX: event.clientX, atY: event.clientY };
  }

  function done() {
    if (!image || !crop) return;
    const result = document.createElement("canvas");
    result.width = result.height = avatarSide;
    result.getContext("2d")!.drawImage(image, crop.left, crop.top, crop.side, crop.side, 0, 0, avatarSide, avatarSide);
    // A photo with much detail can come out larger than the server takes; a second try keeps less of it.
    const picture = [0.85, 0.6].map(quality => result.toDataURL("image/jpeg", quality)).find(value => value.length <= avatarMaxLength);
    if (picture) onDone(picture); else setFailed(true);
  }

  const slider = "h-11 w-full accent-[var(--ink)]";
  return <DialogPanel size="sm" open onOpenChange={open => { if (!open) onCancel(); }} title={t("Cắt ảnh đại diện")} description={t("Kéo ảnh hoặc dùng các thanh trượt để chọn phần nằm trong khung tròn. Ảnh được cắt ngay trên máy bạn.")}>
    {failed ? <p role="alert" className="text-sm leading-6 text-[var(--danger)]">{t("Không đọc được ảnh này. Hãy chọn một ảnh JPEG hoặc PNG khác.")}</p> : <div className="grid gap-3">
      <canvas ref={canvas} width={preview * 2} height={preview * 2} role="img" aria-label={t("Phần ảnh sẽ dùng")}
        onPointerDown={event => { event.currentTarget.setPointerCapture(event.pointerId); drag.current = { atX: event.clientX, atY: event.clientY }; }}
        onPointerMove={move} onPointerUp={() => { drag.current = null; }} onPointerCancel={() => { drag.current = null; }}
        className="mx-auto aspect-square w-60 max-w-full cursor-grab touch-none rounded-full bg-[var(--soft)] active:cursor-grabbing" />
      <label className="grid text-sm font-semibold">{t("Phóng to")}<input className={slider} type="range" min={1} max={3} step={0.05} value={zoom} onChange={event => setZoom(Number(event.target.value))} /></label>
      <div className="grid grid-cols-2 gap-3">
        <label className="grid text-sm font-semibold">{t("Sang ngang")}<input className={slider} type="range" min={0} max={1} step={0.01} value={x} onChange={event => setX(Number(event.target.value))} /></label>
        <label className="grid text-sm font-semibold">{t("Lên xuống")}<input className={slider} type="range" min={0} max={1} step={0.01} value={y} onChange={event => setY(Number(event.target.value))} /></label>
      </div>
    </div>}
    <div className="mt-4 flex flex-wrap justify-end gap-2">
      <Button variant="ghost" onClick={onCancel}>{t("Thôi")}</Button>
      {!failed && <Button disabled={!image} onClick={done}>{t("Dùng ảnh này")}</Button>}
    </div>
  </DialogPanel>;
}

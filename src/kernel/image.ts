import { t } from "./i18n";

type Limits = { maxSide: number; maxBytes: number };
type PreparedImage = { blob: Blob; width: number; height: number };
type PendingEncode = { resolve(value: PreparedImage): void; reject(cause: Error): void };

let encoder: Worker | null = null;
let workerUnavailable = false;
let sequence = 0;
const pending = new Map<number, PendingEncode>();

function getEncoder(): Worker | null {
  if (workerUnavailable || typeof Worker === "undefined" || typeof OffscreenCanvas === "undefined") return null;
  if (encoder) return encoder;
  try {
    const worker = new Worker(new URL("./image.worker.js", import.meta.url), { type: "module" });
    worker.onmessage = (event: MessageEvent<{ id: number; blob?: Blob; width?: number; height?: number; error?: string }>) => {
      const task = pending.get(event.data.id);
      if (!task) return;
      pending.delete(event.data.id);
      if (event.data.blob && event.data.width && event.data.height) task.resolve({ blob: event.data.blob, width: event.data.width, height: event.data.height });
      else task.reject(new Error(event.data.error || t("Không đọc được ảnh này. Hãy chọn ảnh khác.")));
    };
    worker.onerror = () => {
      workerUnavailable = true;
      worker.terminate();
      if (encoder === worker) encoder = null;
      for (const task of pending.values()) task.reject(new Error(t("Không đọc được ảnh này. Hãy chọn ảnh khác.")));
      pending.clear();
    };
    encoder = worker;
    return worker;
  } catch {
    workerUnavailable = true;
    return null;
  }
}

async function encodeBitmap(bitmap: ImageBitmap, limits: Limits): Promise<PreparedImage> {
  const worker = getEncoder();
  if (!worker) throw new Error("Image worker unavailable");
  const id = ++sequence;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    try {
      worker.postMessage({ id, bitmap, maxSide: limits.maxSide, maxBytes: limits.maxBytes }, [bitmap]);
    } catch (cause) {
      pending.delete(id);
      reject(cause instanceof Error ? cause : new Error("Image worker unavailable"));
    }
  });
}

async function encodeMain(source: CanvasImageSource, width: number, height: number, limits: Limits): Promise<PreparedImage> {
  const scale = Math.min(1, limits.maxSide / Math.max(width, height));
  const targetWidth = Math.max(1, Math.round(width * scale));
  const targetHeight = Math.max(1, Math.round(height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = targetWidth;
  canvas.height = targetHeight;
  const context = canvas.getContext("2d");
  if (!context) throw new Error(t("Không đọc được ảnh này. Hãy chọn ảnh khác."));
  context.fillStyle = "#fff";
  context.fillRect(0, 0, targetWidth, targetHeight);
  context.drawImage(source, 0, 0, targetWidth, targetHeight);
  // A detailed image comes out lighter on each try until it fits the upload limit.
  for (const quality of [0.85, 0.72, 0.6, 0.45, 0.3]) {
    const blob = await new Promise<Blob | null>(done => canvas.toBlob(done, "image/jpeg", quality));
    if (blob && blob.size <= limits.maxBytes) return { blob, width: targetWidth, height: targetHeight };
  }
  throw new Error(t("Ảnh này quá nặng. Hãy chọn ảnh khác."));
}

/** A picture redrawn as a small JPEG with metadata stripped, using a worker when the browser supports it. */
export async function toJpeg(file: Blob, limits: Limits): Promise<PreparedImage> {
  if (typeof createImageBitmap === "function") {
    try {
      const bitmap = await createImageBitmap(file);
      try { return await encodeBitmap(bitmap, limits); }
      catch { try { bitmap.close(); } catch { /* It may already have moved to the worker. */ } /* Continue with the broadly supported canvas path. */ }
    } catch { /* Older browsers use the image element path below. */ }
  }
  const address = URL.createObjectURL(file);
  try {
    const picture = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error(t("Không đọc được ảnh này. Hãy chọn ảnh khác.")));
      image.src = address;
    });
    return await encodeMain(picture, picture.naturalWidth, picture.naturalHeight, limits);
  } finally { URL.revokeObjectURL(address); }
}


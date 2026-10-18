self.onmessage = async event => {
  const { id, bitmap, maxSide, maxBytes } = event.data;
  try {
    const initialScale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    let width = Math.max(1, Math.round(bitmap.width * initialScale));
    let height = Math.max(1, Math.round(bitmap.height * initialScale));
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Could not prepare this photo. Choose another one.");
    context.fillStyle = "#fff";
    context.fillRect(0, 0, width, height);
    context.drawImage(bitmap, 0, 0, width, height);

    let format = "image/webp";
    const qualities = [0.85, 0.72, 0.6, 0.45, 0.3];

    async function tryEncode(type, quality) {
      try {
        const blob = await canvas.convertToBlob({ type, quality });
        if (blob && blob.type === type) return blob;
        return null;
      } catch {
        return null;
      }
    }

    let lastBlob = null;
    while (true) {
      for (const quality of qualities) {
        let blob = await tryEncode(format, quality);
        if (!blob && format === "image/webp") {
          format = "image/jpeg";
          blob = await tryEncode(format, quality);
        }
        if (blob) {
          lastBlob = blob;
          if (blob.size <= maxBytes) {
            self.postMessage({ id, blob, width, height });
            return;
          }
        }
      }

      if (Math.max(width, height) > 320) {
        const factor = lastBlob ? Math.min(0.8, Math.max(0.4, Math.sqrt(maxBytes / lastBlob.size) * 0.92)) : 0.75;
        width = Math.max(1, Math.round(width * factor));
        height = Math.max(1, Math.round(height * factor));
        canvas.width = width;
        canvas.height = height;
        context.fillStyle = "#fff";
        context.fillRect(0, 0, width, height);
        context.drawImage(bitmap, 0, 0, width, height);
      } else {
        break;
      }
    }
    throw new Error("This photo is too large. Choose another one.");
  } catch (cause) {
    self.postMessage({ id, error: cause instanceof Error ? cause.message : "Could not prepare this photo." });
  } finally {
    try { bitmap.close(); } catch {}
  }
};

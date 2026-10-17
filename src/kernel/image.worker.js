self.onmessage = async event => {
  const { id, bitmap, maxSide, maxBytes } = event.data;
  try {
    const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = new OffscreenCanvas(width, height);
    const context = canvas.getContext("2d");
    if (!context) throw new Error("Could not prepare this photo. Choose another one.");
    context.fillStyle = "#fff";
    context.fillRect(0, 0, width, height);
    context.drawImage(bitmap, 0, 0, width, height);
    bitmap.close();
    for (const quality of [0.85, 0.72, 0.6, 0.45, 0.3]) {
      const blob = await canvas.convertToBlob({ type: "image/webp", quality });
      if (blob.size <= maxBytes) {
        self.postMessage({ id, blob, width, height });
        return;
      }
    }
    throw new Error("This photo is too large. Choose another one.");
  } catch (cause) {
    self.postMessage({ id, error: cause instanceof Error ? cause.message : "Could not prepare this photo." });
  }
};

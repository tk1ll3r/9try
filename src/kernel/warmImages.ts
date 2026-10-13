const kept = new Map<string, HTMLImageElement>();
const order: string[] = [];
/** Enough for the story window plus a chat album, without holding every photo of a long visit. */
const pool = 32;

/**
 * Fetches these pictures now and holds the elements so the browser does not drop the request.
 * A later <img> with the same address finds the file already here. Ones on screen ask first, at
 * high priority; these follow at low priority and must not cut in front of that request.
 */
export function warmImages(urls: readonly string[]): void {
  if (typeof Image === "undefined") return;
  for (const url of urls) {
    if (!url || kept.has(url)) continue;
    const image = new Image();
    image.decoding = "async";
    image.fetchPriority = "low";
    image.src = url;
    kept.set(url, image);
    order.push(url);
  }
  while (order.length > pool) {
    const oldest = order.shift();
    if (oldest) kept.delete(oldest);
  }
}

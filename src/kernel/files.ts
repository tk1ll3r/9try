import type { SupabaseClient } from "@supabase/supabase-js";

const hour = 3_600_000;
const week = 7 * 24 * hour;
const renewBefore = 5 * 60_000;

function storageKey(bucket: string, path: string) {
  return `gnouht-file:${bucket}:${path}`;
}

/** An address kept on this device. A broken or private store means this visit keeps it in memory only. */
function keptAddress(bucket: string, path: string): { address: string; until: number } | null {
  try {
    const raw = localStorage.getItem(storageKey(bucket, path));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { address?: unknown; until?: unknown };
    if (typeof parsed.address !== "string" || typeof parsed.until !== "number" || parsed.until < Date.now() + renewBefore) return null;
    return { address: parsed.address, until: parsed.until };
  } catch { return null; }
}

function keepAddress(bucket: string, path: string, address: string, until: number) {
  try { localStorage.setItem(storageKey(bucket, path), JSON.stringify({ address, until })); }
  catch { /* A full or private store still works for this visit, from memory. */ }
}

function dropAddress(bucket: string, path: string) {
  try { localStorage.removeItem(storageKey(bucket, path)); }
  catch { /* Nothing stored. */ }
}

/**
 * The files of one private bucket. A file there is loaded through an address the server signs for a
 * week, for a person its rule lets read the file. The same address is kept on the device, so the
 * browser and the service worker can reuse the bytes instead of downloading the file again. It is
 * signed again a few minutes before it stops, so a picture on screen never loses its file.
 */
export class SignedFiles {
  private readonly known = new Map<string, { address: string; until: number }>();

  constructor(private readonly db: SupabaseClient, private readonly bucket: string) {}

  /** Where to load these files from, by name. A file the person may not read is left out. */
  async addresses(paths: readonly string[]): Promise<Map<string, string>> {
    const now = Date.now();
    const wanted: string[] = [];
    for (const path of paths) {
      const held = this.known.get(path) ?? keptAddress(this.bucket, path);
      if (held && held.until >= now + renewBefore) this.known.set(path, held);
      else wanted.push(path);
    }
    if (wanted.length) {
      const { data, error } = await this.db.storage.from(this.bucket).createSignedUrls(wanted, week / 1000);
      if (error) throw error;
      for (const item of data ?? []) if (item.path && item.signedUrl) {
        const kept = { address: item.signedUrl, until: now + week };
        this.known.set(item.path, kept);
        keepAddress(this.bucket, item.path, kept.address, kept.until);
      }
    }
    return new Map(paths.flatMap(path => { const hit = this.known.get(path); return hit ? [[path, hit.address] as const] : []; }));
  }

  /** Puts a JPEG into the bucket under `path`. */
  async put(path: string, blob: Blob, cacheSeconds: number): Promise<void> {
    const { error } = await this.db.storage.from(this.bucket).upload(path, blob, { contentType: "image/jpeg", cacheControl: String(cacheSeconds) });
    if (error) throw error;
  }

  /** Removes files the person put there. One that is already gone, or is not theirs, is left as it is: the server's worker removes what stays behind. */
  async remove(paths: readonly string[]): Promise<void> {
    for (const path of paths) {
      this.known.delete(path);
      dropAddress(this.bucket, path);
    }
    if (paths.length) await this.db.storage.from(this.bucket).remove([...paths]);
  }
}

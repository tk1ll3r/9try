import type { SupabaseClient } from "@supabase/supabase-js";

const hour = 3_600_000;

/**
 * The files of one private bucket. A file there is loaded through an address the server signs for an
 * hour, for a person its rule lets read the file. The addresses are remembered while they work, and
 * signed again a few minutes before they stop, so a picture on screen never loses its file.
 */
export class SignedFiles {
  private readonly known = new Map<string, { address: string; until: number }>();

  constructor(private readonly db: SupabaseClient, private readonly bucket: string) {}

  /** Where to load these files from, by name. A file the person may not read is left out. */
  async addresses(paths: readonly string[]): Promise<Map<string, string>> {
    const now = Date.now();
    const wanted = paths.filter(path => (this.known.get(path)?.until ?? 0) < now + 5 * 60_000);
    if (wanted.length) {
      const { data, error } = await this.db.storage.from(this.bucket).createSignedUrls(wanted, hour / 1000);
      if (error) throw error;
      for (const item of data ?? []) if (item.path && item.signedUrl) this.known.set(item.path, { address: item.signedUrl, until: now + hour });
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
    for (const path of paths) this.known.delete(path);
    if (paths.length) await this.db.storage.from(this.bucket).remove([...paths]);
  }
}

// Removes the files of the app's buckets that no row names any more: a photo that is over or was
// deleted, an upload that was never posted. The database lists them (orphan_media_files); they are
// removed here, through the Storage API, because a row deleted from storage.objects by SQL leaves
// the stored file behind. No imports, so the worker's tests run it on Node.

interface Failure { message: string }
export interface MediaClient {
  rpc(name: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: Failure | null }>;
  storage: { from(bucket: string): { remove(names: string[]): PromiseLike<{ error: Failure | null }> } };
}

/** Removes up to `limit` files that were left behind. Resolves with how many. */
export async function sweepMedia(db: MediaClient, limit = 200): Promise<number> {
  const { data, error } = await db.rpc("orphan_media_files", { p_limit: limit });
  if (error) throw new Error(error.message);
  const byBucket = new Map<string, string[]>();
  for (const file of (data ?? []) as { bucket: string; name: string }[]) byBucket.set(file.bucket, [...byBucket.get(file.bucket) ?? [], file.name]);
  let removed = 0;
  for (const [bucket, names] of byBucket) {
    const answer = await db.storage.from(bucket).remove(names);
    if (answer.error) throw new Error(answer.error.message);
    removed += names.length;
  }
  return removed;
}

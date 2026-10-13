/**
 * `load`, at most once every `gapMs`. A call that comes sooner waits for the next turn, and every
 * call waiting for that turn gets the one result. The first call, and a call after a quiet time,
 * loads at once.
 *
 * The database announces every position a friend sends. With many friends moving, that is many
 * announcements a second, and each one asks for the whole list again; through this they become one
 * load per turn.
 */
export function spaced<T>(load: () => Promise<T>, gapMs: number): () => Promise<T> {
  let last = -Infinity;
  let next: Promise<T> | null = null;
  return () => next ??= new Promise<T>((resolve, reject) => {
    setTimeout(() => {
      last = Date.now(); next = null;
      load().then(resolve, reject);
    }, Math.max(0, last + gapMs - Date.now()));
  });
}

import { keepPreviousData, useInfiniteQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useState } from "react";
import { useModule } from "../../../kernel/session";
import { missedEventMs } from "../../../kernel/realtime";
import { warmImages } from "../../../kernel/warmImages";
import { byPerson, openingMoment, type Moment, type MomentArchiveCursor } from "../domain/Moment";
import { momentsModule } from "../moments.module";

export const momentsKey = ["moments"] as const;
export const momentStreakKey = [...momentsKey, "streaks"] as const;
const none = new Map<string, string>();
const noStreaks = new Map<string, number>();

/** The photos the person may see. The realtime "moments" event reloads them at once; the timer covers a missed event. */
export function useMoments() {
  const repository = useModule(momentsModule);
  return useQuery({ queryKey: momentsKey, queryFn: () => repository.list(), refetchInterval: missedEventMs, staleTime: missedEventMs });
}

/** The current flame badges for the caller and friends. A streak expires after a missed local day. */
export function useMomentStreaks(enabled = true): Map<string, number> {
  const repository = useModule(momentsModule);
  return useQuery({ queryKey: momentStreakKey, queryFn: () => repository.streakBadges(), enabled, refetchInterval: missedEventMs, staleTime: missedEventMs }).data ?? noStreaks;
}

/** Archived photos load in small cursor pages so an account's history never expands the live feed query. */
export function useMomentArchive() {
  const repository = useModule(momentsModule);
  return useInfiniteQuery({
    queryKey: [...momentsKey, "archive"],
    queryFn: ({ pageParam }) => repository.archive(pageParam),
    initialPageParam: undefined as MomentArchiveCursor | undefined,
    getNextPageParam: page => page.next ?? undefined,
    staleTime: missedEventMs,
  });
}

/** Where to load these photos from, by the name of the file. Empty until the server has answered. */
export function usePhotoAddresses(paths: readonly string[]): Map<string, string> {
  const repository = useModule(momentsModule);
  const key = [...paths].sort().join();
  return useQuery({
    queryKey: [...momentsKey, "addresses", key], queryFn: () => repository.addresses(paths), enabled: paths.length > 0,
    // An address works for a week; the repository signs again only what is about to stop working.
    staleTime: 6 * 60 * 60_000, placeholderData: keepPreviousData,
  }).data ?? none;
}

/** The same addresses, and the files themselves started in the background so the next photo is already here. */
export function useWarmedAddresses(paths: readonly string[]): Map<string, string> {
  const addresses = usePhotoAddresses(paths);
  const ready = paths.map(path => addresses.get(path) ?? "").join("\n");
  useEffect(() => {
    warmImages(ready.split("\n"));
  }, [ready]);
  return addresses;
}

/** The time, looked at twice a minute: a photo ends by the clock. */
export function useNow(): number {
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(timer);
  }, []);
  return now;
}

/** Tells the server that the person looked at a photo, a moment after it came on screen. Their own photos are not counted. */
export function useSeen(moment: Moment | undefined) {
  const repository = useModule(momentsModule);
  const queries = useQueryClient();
  const due = moment && !moment.mine && !moment.seen ? moment.id : undefined;
  useEffect(() => {
    if (!due) return;
    const timer = window.setTimeout(() => {
      void repository.see(due).then(() => Promise.all([
        queries.invalidateQueries({ queryKey: momentsKey, exact: true }),
        queries.invalidateQueries({ queryKey: momentStreakKey }),
        queries.invalidateQueries({ queryKey: ["notifications"] }),
      ])).catch(() => undefined);
    }, 900);
    return () => window.clearTimeout(timer);
  }, [due]);
}

/** Who has a photo of the day, for the mark on a friend's face: "new" while the person has not looked at all of them. */
export function useMomentPeople(): Map<string, { state: "new" | "seen"; momentId: string }> {
  const moments = useMoments().data;
  const now = useNow();
  return useMemo(() => new Map(byPerson(moments ?? [], now).filter(person => !person.mine).map(person => [
    person.ownerId, { state: person.unseen ? "new" : "seen", momentId: openingMoment(person).id },
  ] as const)), [moments, now]);
}

import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "./supabase";

const realtimeRoots = new Set(["calendar", "chat", "expenses", "features", "friends", "groups", "location", "moments", "notes", "notifications", "presence"]);

/** How often a screen asks again after realtime missed an event. A change still arrives at once. */
export const missedEventMs = 900_000;

export interface RealtimeRefresh { queryKey: readonly unknown[]; exact?: boolean }

/**
 * Which cached queries a database event must reload. A photo address stays: the file did not change,
 * and a new file arrives under a new name, so it is a new query. Friendship and group changes can
 * take a shared note away without writing the note row.
 */
export function queriesForRealtimeEvent(event: string): RealtimeRefresh[] {
  switch (event) {
    case "moments":
      return [{ queryKey: ["moments"], exact: true }, { queryKey: ["moments", "streaks"] }, { queryKey: ["moments", "archive"] }];
    case "chat":
      return [{ queryKey: ["chat", "conversations"] }, { queryKey: ["chat", "messages"] }, { queryKey: ["chat", "reads"] }];
    case "friends":
    case "groups":
      return [{ queryKey: [event] }, { queryKey: ["notes"] }];
    default:
      return realtimeRoots.has(event) ? [{ queryKey: [event] }] : [];
  }
}

/**
 * Listens on the signed-in user's private realtime topic. The database names each event after
 * the data that changed ("notifications", "friends", "chat"), and every query whose key starts
 * with that name is reloaded. Events can be missed while offline, so a reconnect reloads everything.
 */
export function RealtimeBridge({ userId }: { userId: string }) {
  const queries = useQueryClient();
  useEffect(() => {
    if (!supabase) return;
    const client = supabase;
    let active = true;
    let connectedBefore = false;
    const pending = new Set<string>();
    let flushTimer: number | undefined;
    const flush = () => {
      flushTimer = undefined;
      const roots = [...pending];
      pending.clear();
      for (const event of roots) for (const refresh of queriesForRealtimeEvent(event)) void queries.invalidateQueries(refresh);
    };
    const channel = client.channel(`user:${userId}`, { config: { private: true } })
      .on("broadcast", { event: "*" }, ({ event }) => {
        if (typeof event !== "string" || queriesForRealtimeEvent(event).length === 0) return;
        pending.add(event);
        if (flushTimer === undefined) flushTimer = window.setTimeout(flush, 50);
      });
    void client.realtime.setAuth().then(() => {
      if (!active) return;
      channel.subscribe(status => {
        if (status !== "SUBSCRIBED") return;
        if (connectedBefore) void queries.invalidateQueries({ refetchType: "active" });
        connectedBefore = true;
      });
    });
    return () => { active = false; window.clearTimeout(flushTimer); pending.clear(); void client.removeChannel(channel); };
  }, [userId, queries]);
  return null;
}

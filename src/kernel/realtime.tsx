import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import { supabase } from "../shared/infrastructure/supabase";

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
    const channel = client.channel(`user:${userId}`, { config: { private: true } })
      .on("broadcast", { event: "*" }, ({ event }) => void queries.invalidateQueries({ queryKey: [event] }));
    void client.realtime.setAuth().then(() => {
      if (!active) return;
      channel.subscribe(status => {
        if (status !== "SUBSCRIBED") return;
        if (connectedBefore) void queries.invalidateQueries();
        connectedBefore = true;
      });
    });
    return () => { active = false; void client.removeChannel(channel); };
  }, [userId, queries]);
  return null;
}

import type { SupabaseClient } from "@supabase/supabase-js";
import { notShared, type OnlineFriend, type OnlineRepository, type OnlineSettings, type PresenceAudience } from "../domain/Online";

/** Online presence through SQL functions, which decide on every call who may see whom. */
export class SupabaseOnlineRepository implements OnlineRepository {
  /** Kept from the last beat, because the goodbye has no time to ask for it. */
  private token = "";

  constructor(private readonly db: SupabaseClient, private readonly userId: string, private readonly rest: { url: string; key: string }) {}

  async settings(): Promise<OnlineSettings> {
    const [chosen, viewers] = await Promise.all([
      this.db.from("presence_settings").select("audience,show_last_active").eq("user_id", this.userId).maybeSingle(),
      this.db.from("presence_viewers").select("viewer_id").eq("user_id", this.userId),
    ]);
    if (chosen.error) throw chosen.error;
    if (viewers.error) throw viewers.error;
    if (!chosen.data) return notShared;
    return { audience: chosen.data.audience as PresenceAudience, showLastActive: chosen.data.show_last_active, viewerIds: (viewers.data ?? []).map(row => row.viewer_id as string) };
  }

  async save(settings: OnlineSettings): Promise<void> {
    const { error } = await this.db.rpc("set_presence_sharing", {
      p_audience: settings.audience, p_viewer_ids: settings.audience === "selected" ? settings.viewerIds : [], p_show_last_active: settings.showLastActive,
    });
    if (error) throw error;
  }

  async friends(): Promise<OnlineFriend[]> {
    const { data, error } = await this.db.rpc("list_friend_presence");
    if (error) throw error;
    return (data ?? []).map((row: any) => ({ userId: row.user_id, state: row.state, lastActiveAt: row.last_active_at ?? null }));
  }

  async beat(sessionId: string): Promise<boolean> {
    const { data, error } = await this.db.rpc("presence_heartbeat", { p_session_id: sessionId });
    // A server without presence is the same as a person who does not share it: there is nothing to call.
    if (error?.code === "PGRST202") return false;
    if (error) throw error;
    this.token = (await this.db.auth.getSession()).data.session?.access_token ?? "";
    return data === true;
  }

  leave(sessionId: string): void {
    if (!this.token) return;
    // `keepalive` lets the request finish after the tab is closed. Without it the browser may drop it,
    // and friends would see the person as active for another 90 seconds.
    void fetch(`${this.rest.url}/rpc/presence_leave`, {
      method: "POST", keepalive: true,
      headers: { "Content-Type": "application/json", apikey: this.rest.key, Authorization: `Bearer ${this.token}` },
      body: JSON.stringify({ p_session_id: sessionId }),
    }).catch(() => undefined);
  }
}

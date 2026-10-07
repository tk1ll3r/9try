import type { SupabaseClient } from "@supabase/supabase-js";
import type { ActiveMode, ActivityMode, PresenceRepository } from "../domain/ActivityMode";

/** Row level security returns only the user's own mode and those of accepted friends. */
export class SupabasePresenceRepository implements PresenceRepository {
  constructor(private readonly db: SupabaseClient) {}

  async list(): Promise<ActiveMode[]> {
    const { data, error } = await this.db.from("activity_modes").select("user_id,mode,expires_at").gt("expires_at", new Date().toISOString());
    if (error) throw error;
    return (data ?? []).map(row => ({ userId: row.user_id, mode: row.mode as ActivityMode, expiresAt: row.expires_at }));
  }

  async set(mode: ActivityMode | null, minutes: number): Promise<void> {
    const { error } = await this.db.rpc("set_my_activity_mode", { p_mode: mode, p_minutes: minutes });
    if (error) throw error;
  }
}

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ActiveMode, ActivityMode, CustomActivityMode, CustomModeIcon, PresenceRepository } from "../domain/ActivityMode";

/** Row level security returns only the user's own mode and those of accepted friends. */
export class SupabasePresenceRepository implements PresenceRepository {
  constructor(private readonly db: SupabaseClient, private readonly userId: string) {}

  async list(): Promise<ActiveMode[]> {
    const { data, error } = await this.db.rpc("list_visible_activity_modes");
    if (error) throw error;
    return (data ?? []).map((row: {
      user_id: string; mode: string; updated_at: string; expires_at: string;
      mode_label: string | null; mode_icon: CustomModeIcon | null; mode_color: string | null;
    }) => ({
      userId: row.user_id, mode: row.mode as ActivityMode, startedAt: row.updated_at, expiresAt: row.expires_at,
      modeLabel: row.mode_label ?? null, modeIcon: row.mode_icon ?? null, modeColor: row.mode_color ?? null,
    }));
  }

  async customModes(): Promise<CustomActivityMode[]> {
    const { data, error } = await this.db.from("custom_activity_modes")
      .select("mode,label,icon,color").eq("user_id", this.userId).order("created_at", { ascending: true });
    if (error) throw error;
    return (data ?? []).map(row => ({ mode: row.mode, label: row.label, icon: row.icon, color: row.color } as CustomActivityMode));
  }

  async createCustomMode(mode: Omit<CustomActivityMode, "mode">): Promise<CustomActivityMode> {
    const { data, error } = await this.db.rpc("create_my_custom_activity_mode", {
      p_id: crypto.randomUUID(), p_label: mode.label, p_icon: mode.icon, p_color: mode.color,
    });
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    if (!row) throw new Error("Custom mode was not returned.");
    return { mode: row.mode, label: row.label, icon: row.icon, color: row.color } as CustomActivityMode;
  }

  async set(mode: ActivityMode | null, minutes: number): Promise<void> {
    const { error } = await this.db.rpc("set_my_activity_mode", { p_mode: mode, p_minutes: minutes });
    if (error) throw error;
  }
}

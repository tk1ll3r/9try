import { requireSupabase } from "../../../shared/infrastructure/supabase";

export const activityModes = ["studying", "school", "gaming", "billiards", "drinks", "sleeping"] as const;
export type ActivityMode = typeof activityModes[number];
export interface ActiveMode { userId: string; mode: ActivityMode; expiresAt: string }

export const activityModesData = {
  async list(): Promise<ActiveMode[]> {
    const { data, error } = await requireSupabase().from("activity_modes")
      .select("user_id,mode,expires_at").gt("expires_at", new Date().toISOString());
    if (error) throw error;
    return (data ?? []).map((row) => ({ userId: row.user_id, mode: row.mode as ActivityMode, expiresAt: row.expires_at }));
  },
  async set(mode: ActivityMode | null, minutes: number): Promise<void> {
    const { error } = await requireSupabase().rpc("set_my_activity_mode", { p_mode: mode, p_minutes: minutes });
    if (error) throw error;
  },
};

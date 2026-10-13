import type { SupabaseClient } from "@supabase/supabase-js";
import { defaultNearbyPreference, type LocationNearbyPreference, type LocationRepository, type OwnedLocationSession, type VisibleLocation } from "../domain/Location";
import { t } from "../../../kernel/i18n";

export class SupabaseLocationRepository implements LocationRepository {
  constructor(private readonly db: SupabaseClient, private readonly userId: string) {}

  async listOwned(): Promise<OwnedLocationSession[]> {
    const { data, error } = await this.db.from("location_sessions")
      .select("id,expires_at,approximate,permanent").eq("owner_id", this.userId)
      .is("stopped_at", null).gt("expires_at", new Date().toISOString())
      .order("expires_at", { ascending: true });
    if (error) throw error;
    return data ?? [];
  }

  async start(durationMinutes: number | null, recipientIds: string[], approximate: boolean): Promise<string> {
    const { data, error } = await this.db.rpc("start_location_session_for", {
      p_duration_minutes: durationMinutes ?? 0, p_recipient_ids: recipientIds, p_approximate: approximate,
    });
    if (error) throw error;
    return data as string;
  }

  async stop(sessionId: string): Promise<void> {
    const { error } = await this.db.rpc("stop_location_session", { p_session_id: sessionId });
    if (error) throw error;
  }

  async publish(sessionId: string, position: GeolocationPosition, approximate: boolean): Promise<void> {
    // About 100 m of rounding, done here so the exact position never leaves the device.
    const round = (value: number) => approximate ? Math.round(value * 1000) / 1000 : value;
    const { error } = await this.db.from("location_positions").upsert({
      session_id: sessionId,
      latitude: round(position.coords.latitude),
      longitude: round(position.coords.longitude),
      accuracy_m: approximate ? Math.max(100, position.coords.accuracy) : position.coords.accuracy,
      recorded_at: new Date(position.timestamp).toISOString(),
    });
    if (error) throw error;
  }

  async listVisible(): Promise<VisibleLocation[]> {
    const { data, error } = await this.db.rpc("list_visible_locations");
    if (error) throw error;
    return (data ?? []).map((row: any) => ({
      sessionId: row.session_id,
      ownerId: row.owner_id,
      ownerDisplayName: row.owner_display_name || row.owner_username || t("Người dùng"),
      ownerUsername: row.owner_username,
      expiresAt: row.expires_at,
      approximate: row.approximate,
      latitude: row.latitude,
      longitude: row.longitude,
      accuracyM: row.accuracy_m,
      recordedAt: row.recorded_at,
    }));
  }

  async ask(userId: string): Promise<void> {
    const { error } = await this.db.rpc("request_location", { p_user_id: userId });
    if (error) throw error;
  }

  async nearbyPreference(): Promise<LocationNearbyPreference> {
    const { data, error } = await this.db.rpc("get_location_nearby_preference");
    if (error) throw error;
    const row = Array.isArray(data) ? data[0] : data;
    return row ? {
      radiusM: Number(row.radius_m),
      repeatMinutes: Number(row.repeat_minutes),
    } : defaultNearbyPreference;
  }

  async saveNearbyPreference(preference: LocationNearbyPreference): Promise<void> {
    const { error } = await this.db.rpc("save_location_nearby_preference", {
      // Keep the legacy RPC argument for deployed clients; alerts are automatic now.
      p_enabled: true,
      p_radius_m: preference.radiusM,
      p_repeat_minutes: preference.repeatMinutes,
    });
    if (error) throw error;
  }
}

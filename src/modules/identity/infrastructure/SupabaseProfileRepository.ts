import type { SupabaseClient } from "@supabase/supabase-js";
import { Profile, type ProfileRepository } from "../domain/Profile";

export class SupabaseProfileRepository implements ProfileRepository {
  constructor(private readonly db: SupabaseClient, private readonly userId: string) {}

  async get(): Promise<Profile> {
    const { data, error } = await this.db.from("profiles").select("display_name,username,bio,timezone,birthday").eq("id", this.userId).single();
    if (error) throw error;
    return new Profile(data.display_name ?? "", data.username ?? "", data.bio ?? "",
      data.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone, data.birthday ?? "");
  }

  async save(profile: Profile): Promise<void> {
    const { error } = await this.db.from("profiles").update({
      display_name: profile.displayName,
      username: profile.username || null,
      bio: profile.bio,
      timezone: profile.timezone,
      birthday: profile.birthday || null,
    }).eq("id", this.userId);
    if (error) throw error;
  }

  async exportData(): Promise<unknown> {
    const { data, error } = await this.db.rpc("export_my_data");
    if (error) throw error;
    return data;
  }

  async deleteAccount(): Promise<void> {
    const { data, error } = await this.db.functions.invoke("delete-account", { body: { confirm: true } });
    if (error) throw error;
    if (data?.error) throw new Error(data.error);
    await this.signOut();
  }

  async signOut(): Promise<void> {
    await this.db.auth.signOut();
  }
}

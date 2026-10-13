import type { SupabaseClient } from "@supabase/supabase-js";
import { Profile, type ProfileCard, type ProfileRepository } from "../domain/Profile";

export class SupabaseProfileRepository implements ProfileRepository {
  constructor(private readonly db: SupabaseClient, private readonly userId: string) {}

  async get(): Promise<Profile> {
    // "*" and not a list of columns: a database without the newer ones still answers.
    const { data, error } = await this.db.from("profiles").select("*").eq("id", this.userId).single();
    if (error) throw error;
    const shown = (data.profile_visibility ?? {}) as Record<string, string>;
    return new Profile(data.display_name ?? "", data.username ?? "", data.bio ?? "",
      data.timezone ?? Intl.DateTimeFormat().resolvedOptions().timeZone, data.birthday ?? "",
      data.avatar_url ?? "", shown.bio === "private" ? "private" : "friends", shown.birthday === "friends" ? "friends" : "private");
  }

  async save(profile: Profile): Promise<void> {
    const { data: current, error: readError } = await this.db.from("profiles").select("profile_visibility").eq("id", this.userId).single();
    if (readError) throw readError;
    const { error } = await this.db.from("profiles").update({
      display_name: profile.displayName,
      username: profile.username || null,
      bio: profile.bio,
      timezone: profile.timezone,
      birthday: profile.birthday || null,
      avatar_url: profile.avatarUrl || null,
      // The stored choices this form does not show are kept as they are.
      profile_visibility: { ...(current.profile_visibility as object | null), bio: profile.bioAudience, birthday: profile.birthdayAudience },
    }).eq("id", this.userId);
    if (error) throw error;
  }

  async usernameAvailable(username: string): Promise<boolean> {
    const { data, error } = await this.db.rpc("username_available", { p_username: username });
    if (error) throw error;
    return data === true;
  }

  async card(userId: string): Promise<ProfileCard | null> {
    const { data, error } = await this.db.rpc("get_profile_card", { p_user_id: userId });
    if (error) throw error;
    const row = (data ?? [])[0];
    return row ? { userId: row.user_id, displayName: row.display_name || row.username || "", username: row.username, avatarUrl: row.avatar_url, bio: row.bio, birthday: row.birthday } : null;
  }

  async exportData(): Promise<unknown> {
    const { data, error } = await this.db.rpc("export_my_data");
    if (error) throw error;
    return data;
  }

  async deleteAccount(): Promise<void> {
    const { data, error } = await this.db.functions.invoke("delete-account", { body: { confirm: true } });
    if (error) {
      // The error only says that the function refused; the reason is in the function's answer.
      const reason = await (error as { context?: Response }).context?.json?.().then(body => body?.error, () => undefined);
      throw new Error(typeof reason === "string" ? reason : error.message);
    }
    if (data?.error) throw new Error(data.error);
    await this.signOut();
  }

  async signOut(): Promise<void> {
    await this.db.auth.signOut();
  }
}

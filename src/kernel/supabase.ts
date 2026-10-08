import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined;

export const isSupabaseConfigured = Boolean(url && key);
export const supabase = isSupabaseConfigured ? createClient(url!, key!, { auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true } }) : null;
/** Where the project's Edge Functions are served. */
export const functionsUrl = `${url ?? ""}/functions/v1`;

/**
 * The sign-in methods the project has turned on, by name. This is what the server tells anyone who
 * holds the publishable key.
 */
export async function signInProviders(): Promise<Record<string, boolean>> {
  const response = await fetch(`${url}/auth/v1/settings`, { headers: { apikey: key ?? "" } });
  if (!response.ok) throw new Error(`auth settings: ${response.status}`);
  return ((await response.json()) as { external?: Record<string, boolean> }).external ?? {};
}

export function requireSupabase() {
  if (!supabase) throw new Error("Supabase chưa được cấu hình.");
  return supabase;
}

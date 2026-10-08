/**
 * Sign-in with Google that comes straight back to this app. Google's screen names the domain it
 * returns to, so this way it names the app's own domain; through Supabase's address
 * (`signInWithOAuth`) it names the Supabase project instead. Google hands back an ID token in the
 * address, and Supabase checks that token before it opens a session.
 */

/** The Google OAuth client that the Supabase project trusts. Public: it is in every sign-in address. */
export const googleClientId = (import.meta.env.VITE_GOOGLE_CLIENT_ID as string | undefined)?.trim() || undefined;

const nonceKey = "gnouht-google-nonce";
const hex = (bytes: Uint8Array) => Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");

/**
 * Sends the browser to Google. Google puts the hash of the nonce into the token; Supabase then asks
 * for the nonce itself, which only this browser has, so a token taken from somewhere else is refused.
 * Rejects when the nonce cannot be made or kept: no storage, or no crypto on a page without https.
 */
export async function leaveForGoogle(clientId: string): Promise<void> {
  const nonce = hex(crypto.getRandomValues(new Uint8Array(32)));
  const hashed = hex(new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(nonce))));
  localStorage.setItem(nonceKey, nonce);
  // The address Google returns to must be listed, letter for letter, in the client's redirect URIs.
  const query = new URLSearchParams({ client_id: clientId, response_type: "id_token", scope: "openid email profile", redirect_uri: window.location.origin, nonce: hashed });
  window.location.assign(`https://accounts.google.com/o/oauth2/v2/auth?${query}`);
}

/** Takes the token Google left in the address, with the nonce kept for it. Null when Google did not open this page. */
export function takeGoogleToken(): { token: string; nonce: string } | null {
  const token = new URLSearchParams(window.location.hash.slice(1)).get("id_token");
  if (!token) return null;
  window.history.replaceState(window.history.state, "", window.location.pathname + window.location.search);
  let nonce = "";
  try {
    nonce = localStorage.getItem(nonceKey) ?? "";
    localStorage.removeItem(nonceKey);
  } catch { /* Without the nonce the token cannot be used. */ }
  return { token, nonce };
}

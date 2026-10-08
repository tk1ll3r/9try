import type { User } from "@supabase/supabase-js";
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { isSupabaseConfigured, signInProviders, supabase } from "./supabase";

/** What Supabase reports when a sign-in request fails. */
export interface AuthFailure {
  status?: number;
  code?: string;
  message?: string;
}

/** A sign-in that did not finish when the browser came back: from the emailed link, or from a provider such as Google. */
export type SignInFailure = "link" | "provider";

interface Auth {
  user: User | null;
  /** True until the stored session has been read. */
  loading: boolean;
  /** False when the app was built without a Supabase address and key. */
  configured: boolean;
  /** Emails a sign-in link and a 6-digit code. Resolves with the failure, or null when the request was accepted. */
  sendSignIn(email: string, redirectTo: string): Promise<AuthFailure | null>;
  /** Signs in with the emailed code. Resolves with false when the code is wrong or expired. */
  verifyCode(email: string, code: string): Promise<boolean>;
  /** True when the project offers sign-in with Google. */
  google: boolean;
  /** Leaves for Google's sign-in page; the browser comes back to `redirectTo` signed in. Resolves with the failure when it could not start. */
  signInWithGoogle(redirectTo: string): Promise<AuthFailure | null>;
  /** Set when the page was opened by a sign-in that did not finish. */
  failed: SignInFailure | null;
}

const AuthContext = createContext<Auth | null>(null);

/** Takes the one-time token of a sign-in link out of the address, so it is not kept in history or shared. */
function takeLinkToken(): string | null {
  const params = new URLSearchParams(window.location.search);
  const token = params.get("token_hash");
  if (!token) return null;
  params.delete("token_hash");
  params.delete("type");
  window.history.replaceState(window.history.state, "", window.location.pathname + (params.size ? `?${params}` : "") + window.location.hash);
  return token;
}

/**
 * Takes the error a failed sign-in left in the address. The server puts it in the query and in the
 * fragment. Its text is not shown: anyone can write an address.
 */
function takeReturnError(): SignInFailure | null {
  const url = new URL(window.location.href);
  const fragment = new URLSearchParams(url.hash.slice(1));
  const names = ["error", "error_code", "error_description"];
  if (!names.some(name => url.searchParams.has(name) || fragment.has(name))) return null;
  const code = url.searchParams.get("error_code") ?? fragment.get("error_code");
  for (const name of names) url.searchParams.delete(name);
  window.history.replaceState(window.history.state, "", url.pathname + url.search);
  return code === "otp_expired" ? "link" : "provider";
}

const googleKey = "gnouht-google-sign-in";
/** What the last visit on this device learned, so the button is there at once. */
function rememberedGoogle(): boolean {
  try { return localStorage.getItem(googleKey) === "1"; } catch { return false; }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [failed, setFailed] = useState<SignInFailure | null>(null);
  const [google, setGoogle] = useState(rememberedGoogle);
  const link = useRef<Promise<void> | undefined>(undefined);

  useEffect(() => {
    if (!supabase) return;
    const client = supabase;
    // The button in the sign-in email opens this app with a one-time token in the address
    // (`?token_hash=…`), so the link stays on the app's own domain. The token is exchanged for a
    // session, and a failed return is noted, once per page load; StrictMode replays this effect
    // in development.
    link.current ??= (async () => {
      const returned = takeReturnError();
      if (returned) setFailed(returned);
      const token = takeLinkToken();
      if (!token) return;
      try {
        const { error } = await client.auth.verifyOtp({ token_hash: token, type: "email" });
        if (error) setFailed("link");
      } catch { setFailed("link"); }
    })();
    // Until the exchange ends the screen keeps waiting, so the sign-in form does not flash by.
    let exchanging = true;
    const { data } = client.auth.onAuthStateChange((_event, session) => { setUser(session?.user ?? null); if (!exchanging) setLoading(false); });
    void link.current
      .then(() => { exchanging = false; return client.auth.getSession(); })
      .then(({ data }) => { setUser(data.session?.user ?? null); setLoading(false); });
    return () => data.subscription.unsubscribe();
  }, []);

  // The sign-in screen offers Google only while the project has it turned on. The button appears by
  // itself once Google is set up in the Supabase dashboard, and nobody is sent to a provider that is off.
  useEffect(() => {
    if (loading || user || !isSupabaseConfigured) return;
    let current = true;
    void signInProviders().then(providers => {
      if (!current) return;
      const on = providers.google === true;
      setGoogle(on);
      try { localStorage.setItem(googleKey, on ? "1" : "0"); } catch { /* Asked again on the next visit. */ }
    }, () => { /* No answer: keep what the last visit learned. */ });
    return () => { current = false; };
  }, [loading, user]);

  const value = useMemo<Auth>(() => ({
    user, loading, failed, google, configured: isSupabaseConfigured,
    async sendSignIn(email, redirectTo) {
      const { error } = await supabase!.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo } });
      return error;
    },
    async verifyCode(email, code) {
      const { error } = await supabase!.auth.verifyOtp({ email, token: code, type: "email" });
      return !error;
    },
    async signInWithGoogle(redirectTo) {
      const { error } = await supabase!.auth.signInWithOAuth({ provider: "google", options: { redirectTo } });
      return error;
    },
  }), [user, loading, failed, google]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): Auth {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth outside provider");
  return value;
}

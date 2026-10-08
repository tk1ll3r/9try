import type { User } from "@supabase/supabase-js";
import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { isSupabaseConfigured, supabase } from "./supabase";

/** What Supabase reports when a sign-in request fails. */
export interface AuthFailure {
  status?: number;
  code?: string;
  message?: string;
}

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
  /** True when the page was opened from a sign-in link that did not sign in: expired, already used, or no connection. */
  linkFailed: boolean;
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

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(isSupabaseConfigured);
  const [linkFailed, setLinkFailed] = useState(false);
  const link = useRef<Promise<void> | undefined>(undefined);

  useEffect(() => {
    if (!supabase) return;
    const client = supabase;
    // The button in the sign-in email opens this app with a one-time token in the address
    // (`?token_hash=…`), so the link stays on the app's own domain. The token is exchanged for a
    // session once per page load; StrictMode replays this effect in development.
    link.current ??= (async () => {
      const token = takeLinkToken();
      if (!token) return;
      try {
        const { error } = await client.auth.verifyOtp({ token_hash: token, type: "email" });
        if (error) setLinkFailed(true);
      } catch { setLinkFailed(true); }
    })();
    // Until the exchange ends the screen keeps waiting, so the sign-in form does not flash by.
    let exchanging = true;
    const { data } = client.auth.onAuthStateChange((_event, session) => { setUser(session?.user ?? null); if (!exchanging) setLoading(false); });
    void link.current
      .then(() => { exchanging = false; return client.auth.getSession(); })
      .then(({ data }) => { setUser(data.session?.user ?? null); setLoading(false); });
    return () => data.subscription.unsubscribe();
  }, []);

  const value = useMemo<Auth>(() => ({
    user, loading, linkFailed, configured: isSupabaseConfigured,
    async sendSignIn(email, redirectTo) {
      const { error } = await supabase!.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo } });
      return error;
    },
    async verifyCode(email, code) {
      const { error } = await supabase!.auth.verifyOtp({ email, token: code, type: "email" });
      return !error;
    },
  }), [user, loading, linkFailed]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): Auth {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth outside provider");
  return value;
}

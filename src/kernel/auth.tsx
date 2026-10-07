import type { User } from "@supabase/supabase-js";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
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
}

const AuthContext = createContext<Auth | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(isSupabaseConfigured);

  useEffect(() => {
    if (!supabase) return;
    void supabase.auth.getSession().then(({ data }) => { setUser(data.session?.user ?? null); setLoading(false); });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => { setUser(session?.user ?? null); setLoading(false); });
    return () => data.subscription.unsubscribe();
  }, []);

  const value = useMemo<Auth>(() => ({
    user, loading, configured: isSupabaseConfigured,
    async sendSignIn(email, redirectTo) {
      const { error } = await supabase!.auth.signInWithOtp({ email, options: { emailRedirectTo: redirectTo } });
      return error;
    },
    async verifyCode(email, code) {
      const { error } = await supabase!.auth.verifyOtp({ email, token: code, type: "email" });
      return !error;
    },
  }), [user, loading]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): Auth {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth outside provider");
  return value;
}

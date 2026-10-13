import { useEffect, useRef, useState } from "react";
import { locale } from "../../kernel/i18n";
import { supabase } from "../../kernel/supabase";

export interface PublicSiteMetrics {
  users: bigint | null;
  visits: bigint | null;
  requests: bigint | null;
}

type DatabaseMetrics = Pick<PublicSiteMetrics, "users" | "visits">;

function count(value: unknown): bigint | null {
  try {
    const parsed = typeof value === "bigint" ? value : BigInt(String(value));
    return parsed >= 0n ? parsed : null;
  } catch {
    return null;
  }
}

function decode(data: unknown): DatabaseMetrics | null {
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== "object") return null;
  const values = row as { total_users?: unknown; total_visits?: unknown };
  const users = count(values.total_users);
  const visits = count(values.total_visits);
  return users === null || visits === null ? null : { users, visits };
}

async function callMetrics(name: "get_public_site_metrics" | "record_public_landing_view"): Promise<DatabaseMetrics | null> {
  if (!supabase) return null;
  try {
    const { data, error } = await supabase.rpc(name);
    return error ? null : decode(data);
  } catch {
    return null;
  }
}

async function readRequestCount(): Promise<bigint | null> {
  try {
    const response = await fetch("/api/public-request-count", { cache: "no-store" });
    if (!response.ok) return null;
    const data: unknown = await response.json();
    if (!data || typeof data !== "object") return null;
    return count((data as { requests?: unknown }).requests);
  } catch {
    return null;
  }
}

/** Count page openings once; refresh database aggregates and the Cloudflare request total while visible. */
export function usePublicSiteMetrics(): PublicSiteMetrics {
  const [metrics, setMetrics] = useState<PublicSiteMetrics>({ users: null, visits: null, requests: null });
  // React StrictMode repeats effects once in development; share the first request across that replay.
  const firstDatabaseRequest = useRef<Promise<DatabaseMetrics | null> | null>(null);
  const firstCounterRequest = useRef<Promise<bigint | null> | null>(null);

  useEffect(() => {
    let mounted = true;
    const refresh = (initial = false) => {
      if (!initial && document.visibilityState !== "visible") return;
      if (initial && supabase) firstDatabaseRequest.current ??= callMetrics("record_public_landing_view");
      if (initial) firstCounterRequest.current ??= readRequestCount();
      if (supabase) {
        const databaseRequest = initial ? firstDatabaseRequest.current! : callMetrics("get_public_site_metrics");
        void databaseRequest.then(value => {
          if (mounted && value) setMetrics(current => ({ ...current, ...value }));
        });
      }
      const counterRequest = initial ? firstCounterRequest.current! : readRequestCount();
      void counterRequest.then(value => {
        if (mounted && value !== null) setMetrics(current => ({ ...current, requests: value }));
      });
    };
    refresh(true);
    const onVisibility = () => { if (document.visibilityState === "visible") void refresh(); };
    document.addEventListener("visibilitychange", onVisibility);
    const timer = window.setInterval(() => { void refresh(); }, 60_000);
    return () => { mounted = false; document.removeEventListener("visibilitychange", onVisibility); window.clearInterval(timer); };
  }, []);

  return metrics;
}

export function formatPublicMetric(value: bigint | null): string {
  return value === null ? "—" : new Intl.NumberFormat(locale).format(value);
}

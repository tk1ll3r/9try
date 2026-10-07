import { defineConfig } from "vitest/config";
// The Edge Function tests run the function's handler on Node; see supabase/functions/calendar-feed/index.test.ts.
export default defineConfig({ test: { include: ["src/**/*.test.{ts,tsx}", "supabase/functions/**/*.test.ts"] } });

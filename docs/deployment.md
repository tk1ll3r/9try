# Deploy gnouht.space

1. Create a Supabase project and apply `supabase/migrations`.
2. Configure Auth Site URL as `https://gnouht.space` and allowed local redirects.
3. Set frontend variables from `.env.example`.
4. Build with `npm ci && npm run build`; deploy `dist/` to Cloudflare Pages/Workers static assets.
5. Bind `gnouht.space` to the frontend. Do **not** alter the existing `mcp.gnouht.space` DNS record, tunnel, or Cloudflare Access policy.
6. Schedule server-side reminder processing. Configure VAPID secrets before enabling web push.
7. Keep MapLibre attribution visible and review the selected tile provider's current terms before production.

The hosted frontend + Supabase remain online while a personal development computer is powered off.

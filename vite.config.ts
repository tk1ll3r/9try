import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: "prompt",
      includeAssets: ["icon.svg", "apple-touch-icon.png"],
      manifest: {
        name: "Gnouht Together",
        short_name: "Gnouht",
        description: "Lên lịch, gặp gỡ và giữ kết nối với những người thân thiết.",
        lang: "vi",
        theme_color: "#cf3e80",
        background_color: "#fff5f8",
        display: "standalone",
        start_url: "/",
        icons: [
          { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
          { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
          { src: "/icon.svg", sizes: "any", type: "image/svg+xml" },
        ],
        shortcuts: [
          { name: "Mode của bạn bè", url: "/" },
          { name: "Ghi chú", url: "/notes" },
          { name: "Lịch", url: "/calendar" },
          { name: "Vị trí bạn bè", url: "/me/location" },
          { name: "Thông báo", url: "/notifications" },
        ],
      },
      workbox: {
        cleanupOutdatedCaches: true,
        navigateFallback: "/index.html",
        // Map renderer/worker are large route-only assets; fetch on demand, not at install.
        globIgnores: ["**/MapCanvas-*.js", "**/maplibre-gl-worker-*.js"],
        importScripts: ["push-handler.js"],
        runtimeCaching: [
          {
            urlPattern: ({ request, url }) => url.origin === self.location.origin
              && !url.pathname.startsWith("/auth/") && !url.pathname.startsWith("/rest/")
              && !url.pathname.startsWith("/media/")
              && ["style", "script", "font", "image"].includes(request.destination),
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "gnouht-static-v1",
              expiration: { maxEntries: 80, maxAgeSeconds: 604800 },
            },
          },
          // Photos served through the R2 media proxy on the same origin. The query string carries
          // the Supabase signed URL for cache misses; ignoreSearch keeps one cache entry per file.
          {
            urlPattern: ({ url }) => url.origin === self.location.origin && url.pathname.startsWith("/media/"),
            handler: "CacheFirst",
            options: {
              cacheName: "gnouht-photos-v2",
              expiration: { maxEntries: 1500, maxAgeSeconds: 60 * 60 * 24 * 180 },
              cacheableResponse: { statuses: [0, 200] },
              matchOptions: { ignoreSearch: true },
            },
          },
          // Private photos. The query string is the signed token; ignoreSearch keeps one entry per file.
          {
            urlPattern: ({ url }) => url.hostname.endsWith(".supabase.co") && url.pathname.includes("/storage/v1/object/"),
            handler: "CacheFirst",
            options: {
              cacheName: "gnouht-photos-v1",
              expiration: { maxEntries: 1500, maxAgeSeconds: 60 * 60 * 24 * 180 },
              cacheableResponse: { statuses: [0, 200] },
              matchOptions: { ignoreSearch: true },
            },
          },
        ],
      },
    }),
  ],
});

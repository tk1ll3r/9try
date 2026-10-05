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
      includeAssets: ["icon.svg"],
      manifest: {
        name: "Gnouht Together",
        short_name: "Gnouht",
        description: "Lên lịch, gặp gỡ và giữ kết nối với những người thân thiết.",
        lang: "vi",
        theme_color: "#171a12",
        background_color: "#f4f1e8",
        display: "standalone",
        start_url: "/",
        icons: [{ src: "/icon.svg", sizes: "any", type: "image/svg+xml", purpose: "any maskable" }]
      },
      workbox: {
        cleanupOutdatedCaches: true,
        navigateFallback: "/index.html",
        runtimeCaching: [
          {
            urlPattern: ({ request }) => ["style", "script", "font", "image"].includes(request.destination),
            handler: "StaleWhileRevalidate",
            options: {
              cacheName: "gnouht-static-v1",
              expiration: { maxEntries: 80, maxAgeSeconds: 604800 }
            }
          }
        ]
      }
    })
  ]
});

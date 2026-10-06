import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      // In dev il service worker è disabilitato per non rompere HMR
      devOptions: { enabled: false },
      includeAssets: ["favicon.svg", "icon.svg", "icon-192.png", "icon-512.png"],
      manifest: {
        name: "Chaos Radio",
        short_name: "Chaos",
        description: "Web player Chaos Radio",
        theme_color: "#FF5A1F",
        background_color: "#000000",
        display: "standalone",
        orientation: "portrait",
        start_url: "/player",
        scope: "/",
        icons: [
          {
            src: "/icon-192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "/icon-512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
      },
      workbox: {
        // Precache solo l'app shell, no API responses (sono auth-gated e cambiano)
        globPatterns: ["**/*.{js,css,html,svg,png,ico,woff2}"],
        // Runtime caching disattivato per le API: usiamo il browser standard
        runtimeCaching: [],
        navigateFallback: "/index.html",
        navigateFallbackDenylist: [/^\/api\//],
      },
    }),
  ],
  server: {
    port: 5173,
    host: true, // accessibile da LAN
    // Proxy per /api/* verso il backend Express (3001)
    proxy: {
      "/api": {
        target: "http://localhost:3001",
        changeOrigin: false,
        secure: false,
      },
    },
  },
  preview: {
    port: 5173,
  },
});
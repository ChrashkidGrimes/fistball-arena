import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// https://vite.dev/config/
export default defineConfig({
  base: "./",
  // Bind-mounted sources in a container (Podman/Docker on macOS) don't deliver
  // file-change events reliably; compose.yaml sets DEV_WATCH_POLLING=true.
  server: process.env.DEV_WATCH_POLLING === "true" ? { watch: { usePolling: true, interval: 300 } } : {},
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate", // new deploys activate on the next load, no manual click
      injectRegister: false,      // we register manually in src/UpdatePrompt.jsx
      includeAssets: ["favicon.svg"],
      workbox: {
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        skipWaiting: true,        // take over immediately
        clientsClaim: true,       // control open tabs right away
        cleanupOutdatedCaches: true,
      },
      manifest: {
        name: "Fistball Arena",
        short_name: "Arena",
        description: "Tournament platform for fistball — reports, schedule, publishing.",
        theme_color: "#3a2d6b",
        background_color: "#eef1f6",
        display: "standalone",
        orientation: "landscape",
        icons: [
          { src: "icon-192.png", sizes: "192x192", type: "image/png" },
          { src: "icon-512.png", sizes: "512x512", type: "image/png" },
        ],
      },
    }),
  ],
});

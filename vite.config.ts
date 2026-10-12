import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { VitePWA } from "vite-plugin-pwa";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => ({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [
    react(),
    mode === "development" && componentTagger(),
    VitePWA({
      registerType: "autoUpdate",
      includeAssets: ["favicon.ico", "logo-icon.png"],
      workbox: {
        skipWaiting: true,
        clientsClaim: true,
        globPatterns: ["**/*.{js,css,html,ico,png,svg,woff2}"],
        // Supabase REST/RPC/Functions/Auth responses (financial data) are never cached by the SW.
        // Only public storage objects (logos, static assets) are cached.
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/oewuzgugsjqtznmgnfhp\.supabase\.co\/storage\/v1\/object\/public\/.*/i,
            handler: "CacheFirst",
            options: {
              cacheName: "supabase-storage-public-cache",
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 7 },
              cacheableResponse: { statuses: [200] },
            },
          },
        ],
        cleanupOutdatedCaches: true,
        navigateFallbackDenylist: [/^\/~oauth/],
      },
      manifest: {
        name: "PrestApp — Sistema de Préstamos",
        short_name: "PrestApp",
        description: "Sistema SaaS de gestión de préstamos y cobranza",
        theme_color: "#EA184D",
        background_color: "#F0F0F0",
        display: "standalone",
        orientation: "portrait-primary",
        start_url: "/",
        scope: "/",
        icons: [
          { src: "/logo-icon.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "/logo-icon.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
    }),
  ].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  build: {
    rollupOptions: {
      output: {
        // Function form so recharts stays out of the entry: Rollup moves unassigned shared deps
        // (e.g. clsx) into a manual chunk, which made the entry import vendor-charts.
        manualChunks(id) {
          // Shared helpers used by the entry; keep them out of vendor-charts.
          if (id.includes("commonjsHelpers") || /node_modules\/(clsx|tailwind-merge)\//.test(id)) return "vendor-react";
          if (!id.includes("node_modules")) return;
          if (/node_modules\/(react|react-dom|react-router|react-router-dom|scheduler|@remix-run\/router)\//.test(id)) return "vendor-react";
          if (id.includes("node_modules/@tanstack/")) return "vendor-query";
          if (id.includes("node_modules/@supabase/")) return "vendor-supabase";
          if (/node_modules\/@radix-ui\/react-(dialog|popover|select|tabs)\//.test(id)) return "vendor-ui";
          if (/node_modules\/(recharts|recharts-scale|react-smooth|victory-vendor|d3-[^/]+|internmap)\//.test(id)) return "vendor-charts";
        },
      },
    },
  },
}));

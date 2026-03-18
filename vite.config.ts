

export default {
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  resolve: {
    alias: {
      "@": new URL("./src", import.meta.url).pathname,
      "@tanstack/react-query": new URL(
        "./node_modules/@tanstack/react-query",
        import.meta.url,
      ).pathname,
      "@tanstack/query-core": new URL(
        "./node_modules/@tanstack/query-core",
        import.meta.url,
      ).pathname,
    },
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          "vendor-react": ["react", "react-dom", "react-router-dom"],
          "vendor-query": ["@tanstack/react-query"],
          "vendor-supabase": ["@supabase/supabase-js"],
          "vendor-ui": [
            "@radix-ui/react-dialog",
            "@radix-ui/react-popover",
            "@radix-ui/react-select",
            "@radix-ui/react-tabs",
          ],
          "vendor-charts": ["recharts"],
        },
      },
    },
  },
};

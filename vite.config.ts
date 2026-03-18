import { fileURLToPath, URL } from "node:url";
import { defineConfig } from "vite";

const resolveFromNodeModules = (packagePath: string) =>
  fileURLToPath(new URL(`./node_modules/${packagePath}`, import.meta.url));

export default defineConfig({
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      react: resolveFromNodeModules("react"),
      "react-dom": resolveFromNodeModules("react-dom"),
      "react/jsx-runtime": resolveFromNodeModules("react/jsx-runtime.js"),
      "react/jsx-dev-runtime": resolveFromNodeModules("react/jsx-dev-runtime.js"),
      "react-router": resolveFromNodeModules("react-router"),
      "react-router-dom": resolveFromNodeModules("react-router-dom"),
      "@tanstack/react-query": resolveFromNodeModules("@tanstack/react-query"),
      "@tanstack/query-core": resolveFromNodeModules("@tanstack/query-core"),
    },
    dedupe: ["react", "react-dom", "react-router", "react-router-dom"],
  },
  build: {
    rollupOptions: {
      output: {
        manualChunks: {
          "vendor-react": ["react", "react-dom", "react-router-dom"],
          "vendor-query": ["@tanstack/react-query", "@tanstack/query-core"],
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
});

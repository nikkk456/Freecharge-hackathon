import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const src = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "src");

export default defineConfig({
  plugins: [react()],
  // Must mirror `paths` in tsconfig.json, or `@/…` typechecks but fails at runtime.
  resolve: { alias: { "@": src } },
  server: {
    port: 3000,
    // Proxy API calls to the FastAPI backend during dev to avoid CORS fiddling.
    proxy: {
      "/api": { target: "http://localhost:8000", changeOrigin: true },
      "/health": { target: "http://localhost:8000", changeOrigin: true },
    },
  },
});

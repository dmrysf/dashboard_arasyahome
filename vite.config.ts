import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";
import { defineConfig } from "vite";

const version = (JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as { version: string }).version;

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  define: {
    // Only the isolated real-API browser test artifact may call a loopback HTTP Operations API.
    __DASHBOARD_E2E_LOOPBACK_HOST__: JSON.stringify(mode === "e2e" ? "127.0.0.1" : ""),
    __DASHBOARD_VERSION__: JSON.stringify(version),
  },
  build: { outDir: mode === "e2e" ? "dist-e2e" : "dist", sourcemap: false },
}));

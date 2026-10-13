import react from "@vitejs/plugin-react";
import { readFileSync } from "node:fs";
import { defineConfig } from "vite";

const version = (JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8")) as { version: string }).version;

/**
 * Build modes. `production` (the default) is the live Dashboard and is unchanged by the simulation modes.
 * `simulation` is the hosted factory simulation at https://dashboard.sim.arasyahome.ro; `simulation-e2e` is the same
 * simulation interface built for the isolated loopback browser rehearsal. Only these two show the simulation banner.
 */
const OUT_DIR: Record<string, string> = { e2e: "dist-e2e", simulation: "dist-simulation", "simulation-e2e": "dist-simulation-e2e" };
const LOOPBACK_MODES = new Set(["e2e", "simulation-e2e"]);
const SIMULATION_MODES = new Set(["simulation", "simulation-e2e"]);
/** The Staff application this Dashboard links to (cutting board pairing). Never the live Staff from a simulation build. */
const STAFF_ORIGIN: Record<string, string> = { simulation: "https://sim.arasyahome.ro", "simulation-e2e": "http://127.0.0.1:4175" };

export default defineConfig(({ mode }) => ({
  plugins: [react()],
  define: {
    // Only the isolated real-API browser test artifacts may call a loopback HTTP Operations API.
    __DASHBOARD_E2E_LOOPBACK_HOST__: JSON.stringify(LOOPBACK_MODES.has(mode) ? "127.0.0.1" : ""),
    __DASHBOARD_SIMULATION__: JSON.stringify(SIMULATION_MODES.has(mode)),
    __DASHBOARD_STAFF_ORIGIN__: JSON.stringify(STAFF_ORIGIN[mode] ?? "https://staff.arasyahome.ro"),
    __DASHBOARD_VERSION__: JSON.stringify(version),
  },
  build: { outDir: OUT_DIR[mode] ?? "dist", sourcemap: false },
}));

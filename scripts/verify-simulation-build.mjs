import { access, lstat, readdir, readFile } from "node:fs/promises";
import path from "node:path";

// Verifies the hosted factory-simulation Dashboard (https://dashboard.sim.arasyahome.ro) before it may be packaged:
// required files, no links, the exact simulation API in the bundle and the CSP, the simulation banner compiled in,
// and no production API, live Staff, loopback address, source map or server-side secret name anywhere in it.
// A string scan cannot prove isolation on its own; it is one additional gate next to the build-time API check in
// src/config.ts and the API's own origin allowlist.
const repositoryRoot = path.resolve(import.meta.dirname, "..");
const dist = path.resolve(repositoryRoot, process.argv[2] ?? "dist-simulation");
const SIMULATION_API = "https://api.sim.arasyahome.ro";
const fail = (message) => { throw new Error(`Simulation Dashboard build invalid: ${message}`); };

for (const file of ["index.html", ".htaccess", "robots.txt", "favicon.svg", "favicon.ico", "apple-touch-icon.png"]) {
  try { await access(path.join(dist, file)); } catch { fail(`missing ${file}`); }
}
const files = [];
async function walk(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if ((await lstat(full)).isSymbolicLink()) fail(`symbolic link ${path.relative(dist, full)}`);
    if (entry.isDirectory()) await walk(full); else files.push(full);
  }
}
await walk(dist);
const assets = files.filter((file) => path.dirname(file) === path.join(dist, "assets")).map((file) => path.basename(file));
if (!assets.some((file) => file.endsWith(".js"))) fail("missing JavaScript bundle");
if (!assets.some((file) => file.endsWith(".css"))) fail("missing CSS bundle");
if (files.some((file) => file.endsWith(".map"))) fail("source maps are not published");

const indexHtml = await readFile(path.join(dist, "index.html"), "utf8");
if (!indexHtml.includes("/assets/")) fail("index.html does not reference the Vite assets");
if (!indexHtml.includes('name="robots" content="noindex, nofollow"')) fail("index.html must be noindex");

const htaccess = await readFile(path.join(dist, ".htaccess"), "utf8");
const csp = htaccess.match(/Content-Security-Policy "([^"]+)"/)?.[1] ?? fail("CSP missing");
if (!csp.includes(`connect-src 'self' ${SIMULATION_API};`)) fail("CSP must allow exactly the simulation API");
for (const unsafe of ["unsafe-eval", "unsafe-inline", "*", "api.arasyahome.ro"]) if (csp.replaceAll(SIMULATION_API, "").includes(unsafe)) fail(`CSP allows ${unsafe}`);
if (!csp.includes("frame-ancestors 'none'")) fail("CSP must forbid framing");

// Production addresses that a simulation Dashboard must never contact or link to.
const forbidden = ["https://api.arasyahome.ro", "https://staff.arasyahome.ro", "https://dashboard.arasyahome.ro", "https://b2b.arasyahome.ro", "127.0.0.1", "localhost:", "__DASHBOARD_E2E_LOOPBACK_HOST__", "__DASHBOARD_SIMULATION__", "__DASHBOARD_STAFF_ORIGIN__", "@vite/client", "ARASYA_APP_SECRET", "ARASYA_DB_PASSWORD", "ARASYA_SOURCE_SECRET", "secrets.json", "private.json", "BEGIN OPENSSH PRIVATE KEY", "BEGIN PRIVATE KEY"];
let banner = false;
let api = false;
for (const file of files.filter((name) => /\.(?:js|css|html|json|txt|webmanifest|svg)$/.test(name) || path.basename(name) === ".htaccess")) {
  const source = await readFile(file, "utf8");
  for (const value of forbidden) if (source.includes(value)) fail(`${path.relative(dist, file)} contains “${value}”`);
  if (file.endsWith(".js")) {
    banner ||= source.includes("data-arasya-simulation");
    api ||= source.includes(SIMULATION_API);
  }
}
if (!api) fail("the bundle does not use the simulation API");
if (!banner) fail("the simulation banner is not compiled in");
console.log(`Simulation Dashboard artifact verified (${SIMULATION_API}, ${files.length} files).`);

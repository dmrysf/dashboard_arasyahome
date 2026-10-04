import { access, readdir, readFile } from "node:fs/promises";
import path from "node:path";

// Verifies the production build before it may become a release: required files, a resolved exact-origin CSP,
// no development or test API address, no source maps and no server-side secret names in the bundle.
const repositoryRoot = path.resolve(import.meta.dirname, "..");
const dist = path.join(repositoryRoot, process.argv[2] ?? "dist");
const fail = (message) => { throw new Error(`Build Dashboard invalid: ${message}`); };

for (const file of ["index.html", ".htaccess", "robots.txt", "favicon.svg"]) {
  try { await access(path.join(dist, file)); } catch { fail(`lipsește ${file}`); }
}
const assets = await readdir(path.join(dist, "assets")).catch(() => fail("lipsește directorul assets"));
if (!assets.some((file) => file.endsWith(".js"))) fail("lipsește bundle-ul JavaScript");
if (!assets.some((file) => file.endsWith(".css"))) fail("lipsește bundle-ul CSS");
if (assets.some((file) => file.endsWith(".map"))) fail("source map-urile nu se publică");

const indexHtml = await readFile(path.join(dist, "index.html"), "utf8");
if (!indexHtml.includes("/assets/")) fail("index.html nu referă asset-urile Vite");
if (!indexHtml.includes('name="robots" content="noindex, nofollow"')) fail("index.html trebuie să fie noindex");

const htaccess = await readFile(path.join(dist, ".htaccess"), "utf8");
const csp = htaccess.match(/Content-Security-Policy "([^"]+)"/)?.[1] ?? fail("politica CSP lipsește");
const expectedApi = (process.env.VITE_DASHBOARD_API_BASE_URL ?? "").replace(/\/$/, "");
if (!expectedApi.startsWith("https://")) fail("VITE_DASHBOARD_API_BASE_URL trebuie să fie originea HTTPS de producție");
if (!csp.includes(`connect-src 'self' ${expectedApi};`)) fail("CSP nu permite exact API-ul configurat");
for (const unsafe of ["unsafe-eval", "unsafe-inline", "*"]) if (csp.includes(unsafe)) fail(`CSP permite ${unsafe}`);
if (!csp.includes("frame-ancestors 'none'")) fail("CSP nu blochează încadrarea");
if (!htaccess.includes("max-age=31536000, immutable")) fail("regula cache immutable pentru assets lipsește");
if (!htaccess.includes('Cache-Control "no-store, max-age=0"')) fail("regula no-store pentru entrypoint lipsește");

for (const file of assets.filter((name) => name.endsWith(".js"))) {
  const source = await readFile(path.join(dist, "assets", file), "utf8");
  if (!source.includes(expectedApi)) fail(`bundle-ul ${file} nu folosește API-ul de producție`);
  for (const forbidden of ["127.0.0.1", "localhost:", "__DASHBOARD_E2E_LOOPBACK_HOST__", "@vite/client", "ARASYA_APP_SECRET", "ARASYA_DB_PASSWORD", "ARASYA_SOURCE_SECRET", "secrets.json", "BEGIN OPENSSH PRIVATE KEY"]) {
    if (source.includes(forbidden)) fail(`bundle-ul ${file} conține „${forbidden}”`);
  }
}
console.log(`Artefactele statice Dashboard sunt complete (${expectedApi}).`);

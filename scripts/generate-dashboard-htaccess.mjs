import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

const repositoryRoot = path.resolve(import.meta.dirname, "..");
const templatePath = path.join(repositoryRoot, "scripts", "dashboard-htaccess.template");

/** Accepts only an exact HTTPS origin, so the CSP can never be widened by a path, query or credentials. */
export function normalizeHttpsOrigin(rawValue) {
  const raw = (rawValue ?? "").trim();
  if (!raw) throw new Error("VITE_DASHBOARD_API_BASE_URL is required for the Dashboard CSP.");
  let url;
  try { url = new URL(raw); }
  catch { throw new Error("VITE_DASHBOARD_API_BASE_URL must be a valid HTTPS origin."); }
  if (url.protocol !== "https:" || url.username || url.password || url.search || url.hash || (url.pathname !== "/" && url.pathname !== "")) {
    throw new Error("VITE_DASHBOARD_API_BASE_URL must be an exact HTTPS origin.");
  }
  return url.origin;
}

export async function generateDashboardHtaccess(environment = process.env, outputDirectory = path.join(repositoryRoot, "dist")) {
  const template = await readFile(templatePath, "utf8");
  const output = template.replaceAll("__ARASYA_CONNECT_SRC__", `'self' ${normalizeHttpsOrigin(environment.VITE_DASHBOARD_API_BASE_URL)}`);
  if (output.includes("__ARASYA_CONNECT_SRC__")) throw new Error("Dashboard CSP placeholder was not resolved.");
  await writeFile(path.join(outputDirectory, ".htaccess"), output, { encoding: "utf8", mode: 0o644 });
  return output;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await generateDashboardHtaccess();
}

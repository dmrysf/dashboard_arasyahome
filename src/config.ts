/**
 * The Operations API origin is fixed at build time. Production accepts only an exact HTTPS origin;
 * the loopback HTTP origin is accepted only inside the isolated real-API E2E build.
 */
export function resolveApiBaseUrl(raw: string | undefined, allowLoopback: boolean): string {
  const value = (raw ?? "").trim();
  if (!value) throw new Error("VITE_DASHBOARD_API_BASE_URL is required.");
  const url = new URL(value);
  const loopback = allowLoopback && url.protocol === "http:" && url.hostname === "127.0.0.1";
  if ((url.protocol !== "https:" && !loopback) || url.username || url.password || url.search || url.hash || (url.pathname !== "/" && url.pathname !== "")) {
    throw new Error("VITE_DASHBOARD_API_BASE_URL must be an exact HTTPS origin.");
  }
  return url.origin;
}

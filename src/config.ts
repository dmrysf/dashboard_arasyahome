/**
 * The Operations API origin is fixed at build time. Production accepts only an exact HTTPS origin;
 * a loopback HTTP origin is accepted only inside the isolated real-API E2E build, whose host is injected at build
 * time so the production bundle does not even contain it.
 */
export function resolveApiBaseUrl(raw: string | undefined, loopbackHost: string): string {
  const value = (raw ?? "").trim();
  if (!value) throw new Error("VITE_DASHBOARD_API_BASE_URL is required.");
  const url = new URL(value);
  const loopback = loopbackHost !== "" && url.protocol === "http:" && url.hostname === loopbackHost;
  if ((url.protocol !== "https:" && !loopback) || url.username || url.password || url.search || url.hash || (url.pathname !== "/" && url.pathname !== "")) {
    throw new Error("VITE_DASHBOARD_API_BASE_URL must be an exact HTTPS origin.");
  }
  return url.origin;
}

import { SIMULATION_API_ORIGIN } from "./environment";

/**
 * The Operations API origin is fixed at build time. Production accepts only an exact HTTPS origin;
 * a loopback HTTP origin is accepted only inside the isolated real-API E2E builds, whose host is injected at build
 * time so the production bundle does not even contain it.
 *
 * The environments never cross: a simulation build accepts only the simulation API (or its loopback rehearsal
 * server), and a production build refuses the simulation API.
 */
export function resolveApiBaseUrl(raw: string | undefined, loopbackHost: string, simulation = false): string {
  const value = (raw ?? "").trim();
  if (!value) throw new Error("VITE_DASHBOARD_API_BASE_URL is required.");
  const url = new URL(value);
  const loopback = loopbackHost !== "" && url.protocol === "http:" && url.hostname === loopbackHost;
  if ((url.protocol !== "https:" && !loopback) || url.username || url.password || url.search || url.hash || (url.pathname !== "/" && url.pathname !== "")) {
    throw new Error("VITE_DASHBOARD_API_BASE_URL must be an exact HTTPS origin.");
  }
  if (simulation ? !loopback && url.origin !== SIMULATION_API_ORIGIN : url.origin === SIMULATION_API_ORIGIN) {
    throw new Error("VITE_DASHBOARD_API_BASE_URL does not belong to this build environment.");
  }
  return url.origin;
}

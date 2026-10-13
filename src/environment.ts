/**
 * Build-time environment of this Dashboard artifact. Fixed by the Vite build mode (see vite.config.ts); nothing in
 * the URL, the browser storage or a server answer can switch a build into or out of simulation. The `typeof` guards
 * keep the unit tests (which run without the Vite defines) on the production values.
 */
export const SIMULATION_BUILD: boolean = typeof __DASHBOARD_SIMULATION__ !== "undefined" && __DASHBOARD_SIMULATION__ === true;

/** The Staff application linked from the Dashboard: the live Staff for production, the simulation Staff otherwise. */
export const STAFF_ORIGIN: string = typeof __DASHBOARD_STAFF_ORIGIN__ !== "undefined" ? __DASHBOARD_STAFF_ORIGIN__ : "https://staff.arasyahome.ro";

/** The only Operations API a hosted simulation Dashboard may call. */
export const SIMULATION_API_ORIGIN = "https://api.sim.arasyahome.ro";

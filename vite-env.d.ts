/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DASHBOARD_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare const __DASHBOARD_E2E_LOOPBACK_HOST__: string;
/** True only in the `simulation` and `simulation-e2e` builds (build-time, never from the URL or the server). */
declare const __DASHBOARD_SIMULATION__: boolean;
declare const __DASHBOARD_STAFF_ORIGIN__: string;
declare const __DASHBOARD_VERSION__: string;

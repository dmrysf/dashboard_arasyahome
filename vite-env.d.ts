/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_DASHBOARD_API_BASE_URL?: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

declare const __DASHBOARD_E2E_LOOPBACK_HOST__: string;
declare const __DASHBOARD_VERSION__: string;

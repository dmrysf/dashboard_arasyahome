import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import { resolveApiBaseUrl } from "./config";
import "./styles.css";

const root = createRoot(document.getElementById("root") as HTMLElement);
try {
  const apiBaseUrl = resolveApiBaseUrl(import.meta.env.VITE_DASHBOARD_API_BASE_URL, __DASHBOARD_E2E_LOOPBACK_HOST__);
  root.render(<StrictMode><App apiBaseUrl={apiBaseUrl} /></StrictMode>);
} catch {
  root.render(<div className="boot" role="alert"><span className="brand-mark">A</span><p>Panoul de control nu este configurat.</p></div>);
}

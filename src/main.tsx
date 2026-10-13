import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./app/App";
import { SimulationBanner } from "./components/SimulationBanner";
import { resolveApiBaseUrl } from "./config";
import { SIMULATION_BUILD } from "./environment";
import { initialLocale, MESSAGES } from "./i18n";
import { I18nProvider } from "./i18n/context";
import "./styles.css";
import "./analytics.css";

const root = createRoot(document.getElementById("root") as HTMLElement);
// The simulation marker comes from the build mode only; the stylesheet reserves room for the banner from it.
if (SIMULATION_BUILD) document.documentElement.dataset.arasyaEnvironment = "simulation";
try {
  const apiBaseUrl = resolveApiBaseUrl(import.meta.env.VITE_DASHBOARD_API_BASE_URL, __DASHBOARD_E2E_LOOPBACK_HOST__, SIMULATION_BUILD);
  root.render(<StrictMode><I18nProvider>{SIMULATION_BUILD && <SimulationBanner />}<App apiBaseUrl={apiBaseUrl} /></I18nProvider></StrictMode>);
} catch {
  const locale = initialLocale();
  document.documentElement.lang = locale;
  root.render(<I18nProvider>{SIMULATION_BUILD && <SimulationBanner />}<div className="boot" role="alert"><span className="brand-mark">A</span><p>{MESSAGES[locale].brand.notConfigured}</p></div></I18nProvider>);
}

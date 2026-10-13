import { useI18n } from "../i18n/context";

/**
 * Always-visible marker of the factory simulation Dashboard. It is rendered only by the simulation builds (see
 * `SIMULATION_BUILD`), sits in the page flow above every screen (sign-in included) and never covers navigation,
 * dialogs (they open in the top layer) or decisions.
 */
export function SimulationBanner() {
  const { t } = useI18n();
  return (
    <p className="simulation-banner" role="note" data-arasya-simulation="banner">
      <strong>{t.simulation.environment}</strong>
      <span aria-hidden="true">—</span>
      <span>{t.simulation.testData}</span>
    </p>
  );
}

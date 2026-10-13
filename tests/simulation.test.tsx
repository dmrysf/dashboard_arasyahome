import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { SimulationBanner } from "../src/components/SimulationBanner";
import { resolveApiBaseUrl } from "../src/config";
import { SIMULATION_API_ORIGIN, SIMULATION_BUILD, STAFF_ORIGIN } from "../src/environment";
import { I18nProvider } from "../src/i18n/context";

test("a simulation build talks only to the simulation API or its loopback rehearsal server", () => {
  assert.equal(resolveApiBaseUrl("https://api.sim.arasyahome.ro", "", true), SIMULATION_API_ORIGIN);
  assert.equal(resolveApiBaseUrl("https://api.sim.arasyahome.ro/", "", true), SIMULATION_API_ORIGIN);
  assert.equal(resolveApiBaseUrl("http://127.0.0.1:8788", "127.0.0.1", true), "http://127.0.0.1:8788");
  for (const bad of ["https://api.arasyahome.ro", "https://api.sim.arasyahome.ro.evil.test", "https://evil.test", "https://api.sim.arasyahome.ro:8443", "http://api.sim.arasyahome.ro", "https://api.sim.arasyahome.ro/v1", "https://user@api.sim.arasyahome.ro", "http://127.0.0.1:8788", ""]) {
    assert.throws(() => resolveApiBaseUrl(bad, "", true), bad);
  }
});

test("a production build never talks to the simulation API", () => {
  assert.equal(resolveApiBaseUrl("https://api.arasyahome.ro", ""), "https://api.arasyahome.ro");
  assert.throws(() => resolveApiBaseUrl("https://api.sim.arasyahome.ro", ""));
});

test("outside a simulation build the environment is production", () => {
  assert.equal(SIMULATION_BUILD, false);
  assert.equal(STAFF_ORIGIN, "https://staff.arasyahome.ro");
});

test("the simulation banner is an always-present note in the interface language", () => {
  const ro = renderToStaticMarkup(<I18nProvider locale="ro"><SimulationBanner /></I18nProvider>);
  assert.match(ro, /role="note"/);
  assert.match(ro, /data-arasya-simulation="banner"/);
  assert.match(ro, /MEDIU DE SIMULARE/);
  assert.match(ro, /Date de test/);
  const tr = renderToStaticMarkup(<I18nProvider locale="tr"><SimulationBanner /></I18nProvider>);
  assert.match(tr, /SİMÜLASYON ORTAMI/);
  assert.match(tr, /Test Verileri/);
});

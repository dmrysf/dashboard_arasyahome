import { expect, request, test, type Browser, type Page } from "@playwright/test";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

// Tailoring quality supervision seen from the Dashboard (Operations API 2.28): the CEO appoints the supervisor
// in Organization; a stage-7 defect goes to stage 3 under the supervisor without any manager; the managers'
// queue receives only the final return to cutting, and the approval needs an explicit attribution.
type Fixture = {
  exceptions: { password: string; managers: { username: string; name: string }[]; cutter: string };
  supervision: { ceo: string; chief: string; chiefName: string; tailor: string };
};
const fixture = JSON.parse(readFileSync(path.join(import.meta.dirname, ".real-api-fixture.json"), "utf8")) as Fixture;
const API = "http://127.0.0.1:8788";
const ORIGIN = "http://127.0.0.1:4175";
const NUMBER = "93001";
const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

async function ingest(number: string) {
  const items = [[1, "Voal A", 5], [2, "Draperie D", 9]].map(([line, name, meters]) => ({ id: Number(number) * 10 + Number(line), line, name, sku: `SV-${line}`, color: "Ivory", width: 300, height: 260, unit: "cm", meters, quantity: 1 }));
  const body = JSON.stringify({ schemaVersion: 1, eventId: `dashboard-e2e-sup-${number}`, changedAt: new Date(Date.now() - 60_000).toISOString().replace(/\.\d{3}Z$/, "Z"),
    order: { id: number, number, status: { code: "processing", label: "Se procesează" }, availability: "active", acceptedAt: new Date(Date.now() - 3_600_000).toISOString().replace(/\.\d{3}Z$/, "Z"), items },
    production: { workflowKey: "curtain-production", workflowVersion: 1, stageId: "material-preparation" } });
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = "v1=" + createHmac("sha256", "trendhome-integration-secret-0123456789abcdef").update(`${timestamp}.${body}`).digest("hex");
  const response = await fetch(`${API}/integrations/sources/trendhome/orders`, { method: "POST", headers: { "Content-Type": "application/json", "X-Arasya-Timestamp": timestamp, "X-Arasya-Signature": signature }, body });
  const payload = await response.json();
  expect(payload.outcome).toBe("applied");
  return payload.qr as string;
}

async function staff(username: string) {
  const context = await request.newContext({ baseURL: API, extraHTTPHeaders: { Origin: ORIGIN } });
  const login = await context.post("/auth/login", { data: { username, password: fixture.exceptions.password } });
  expect(login.status()).toBe(200);
  const csrf = (await login.json()).csrfToken as string;
  let counter = 0;
  const post = async (url: string, data: unknown) => {
    counter += 1;
    const response = await context.post(url, { data, headers: { "X-CSRF-Token": csrf, "Idempotency-Key": `dash-sup-${username.replace(/[^A-Za-z0-9]/g, "-")}-${Date.now()}-${counter}` } });
    expect(response.status(), await response.text()).toBeLessThan(300);
    return response.json();
  };
  return { context, post, get: async (url: string) => (await context.get(url)).json() };
}

async function signIn(browser: Browser, username: string, width: number, height: number) {
  const context = await browser.newContext({ viewport: { width, height }, reducedMotion: "reduce" });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await page.getByLabel("Nume utilizator").fill(username);
  await page.getByLabel("Parolă").fill(fixture.exceptions.password);
  await page.getByRole("button", { name: "Intră în cont" }).click();
  // The sign-in form has its own heading; wait for the signed-in shell instead.
  await expect(page.getByRole("button", { name: "Ieși din cont" })).toBeAttached();
  return { context, page, errors };
}

test("the CEO appoints the supervisor; the internal 7 -> 3 return never reaches the managers; the 3 -> 2 return needs an attribution", async ({ browser }) => {
  test.setTimeout(180_000);
  const ceo = await signIn(browser, fixture.supervision.ceo, 1280, 900);
  await ceo.page.goto("/organizatie");
  await ceo.page.getByLabel("Responsabilitate").selectOption({ label: "Șef de croitorie (probleme de calitate)" });
  await ceo.page.getByLabel("Caută angajat").fill("VASILOAIA");
  const picker = ceo.page.getByLabel("Angajat", { exact: true });
  await expect(picker.locator("option", { hasText: "VASILOAIA IULIANA" })).toHaveCount(1);
  await picker.selectOption({ index: 1 });
  await ceo.page.getByRole("button", { name: "Atribuie", exact: true }).click();
  await expect(ceo.page.getByRole("row", { name: /Șef de croitorie \(probleme de calitate\)/ })).toContainText("VASILOAIA IULIANA");

  // Cut, carried through tailoring to stage 7 (side-hem), reported there, verified by the supervisor.
  const qr = await ingest(NUMBER);
  const id = encodeURIComponent(`trendhome:${NUMBER}`);
  const cutter = await staff(fixture.exceptions.cutter);
  const tailor = await staff(fixture.supervision.tailor);
  const chief = await staff(fixture.supervision.chief);
  const pool = await cutter.get("/cutting/pool");
  await cutter.post(`/orders/${id}/claim`, { expectedVersion: 1, qrToken: qr, ownedCount: pool.ownedCount, confirmedMultiple: pool.ownedCount > 0 });
  let order = await cutter.post(`/orders/${id}/transition`, { expectedVersion: 2 });
  for (;;) {
    order = await tailor.post(`/orders/${id}/claim`, { expectedVersion: order.productionVersion });
    if (order.productionStageId === "side-hem") break;
    order = await tailor.post(`/orders/${id}/transition`, { expectedVersion: order.productionVersion });
  }
  const line = order.products.find((item: { name: string }) => item.name === "Draperie D").id;
  const reported = await tailor.post(`/orders/${id}/fault-reports`, { expectedVersion: order.productionVersion, itemIds: [line], reasonKey: "cut-meterage" });
  expect(reported.status).toBe("awaiting_supervisor_review");
  const accepted = await chief.post(`/production-exceptions/${reported.id}/review`, { expectedVersion: reported.version, decision: "accept", reasonKey: "cut-meterage", qrToken: qr });
  expect(accepted.status).toBe("in_supervisor_custody");

  const denisa = await signIn(browser, fixture.exceptions.managers[0].username, 390, 844);
  await expect(denisa.page).toHaveURL(/\/aprobari$/);
  await expect(denisa.page.getByRole("button", { name: new RegExp(`Comanda ${NUMBER}`) })).toHaveCount(0);
  await denisa.page.goto("/aprobari/in-asteptare");
  await expect(denisa.page.getByRole("button", { name: new RegExp(`Comanda ${NUMBER}`) })).toHaveCount(0);

  // Only after the supervisor sends it and the cutter scans the product does a decision exist.
  const sent = await chief.post(`/production-exceptions/${reported.id}/return`, { expectedVersion: accepted.version });
  await cutter.post(`/production-exceptions/${reported.id}/acknowledge`, { expectedVersion: sent.version, confirmed: true, qrToken: qr, responsibility: "accepted" });
  await denisa.page.goto("/aprobari");
  const row = denisa.page.getByRole("button", { name: new RegExp(`Comanda ${NUMBER}`) });
  await expect(row).toContainText("Problemă din croitorie");
  await row.click();
  await expect(denisa.page.getByText("Tivul lateral", { exact: true }).first()).toBeVisible();
  await expect(denisa.page.getByText("VASILOAIA IULIANA", { exact: true }).first()).toBeVisible();
  await expect(denisa.page.getByText("Recunoaște eroarea", { exact: true })).toBeVisible();
  await denisa.page.getByRole("button", { name: "Aprobă returnarea la tăiere" }).click();
  const dialog = denisa.page.getByRole("dialog");
  await expect(dialog.getByTestId("attribution-choice")).toBeVisible();
  await dialog.getByRole("button", { name: "Aprobă returnarea la tăiere" }).click();
  await expect(dialog.getByText("Alege dacă eroarea de tăiere este stabilită.")).toBeVisible();
  for (const width of [360, 390]) { await denisa.page.setViewportSize({ width, height: 800 }); expect(await overflow(denisa.page), `dialog at ${width}`).toBeLessThanOrEqual(0); }
  await dialog.getByRole("radio", { name: /Eroare de tăiere stabilită/ }).check();
  await dialog.getByRole("button", { name: "Aprobă returnarea la tăiere" }).click();
  await expect(denisa.page.getByText("Eroare de tăiere atribuită")).toBeVisible();
  const after = await tailor.get(`/production-exceptions/${reported.id}`);
  expect(after.status).toBe("approved");
  expect(after.attribution).toBe("cutter");

  // Revoke the appointment again so nothing else runs in the supervised flow.
  await ceo.page.goto("/organizatie");
  await ceo.page.getByRole("row", { name: /Șef de croitorie \(probleme de calitate\)/ }).getByRole("button", { name: "Retrage" }).click();
  await ceo.page.getByRole("dialog").getByRole("button", { name: "Retrage" }).click();
  await expect(ceo.page.getByRole("row", { name: /Șef de croitorie \(probleme de calitate\)/ })).toContainText("Retrasă");
  expect(ceo.errors).toEqual([]);
  expect(denisa.errors).toEqual([]);
  for (const who of [cutter, tailor, chief]) await who.context.dispose();
  await ceo.context.close();
  await denisa.context.close();
});

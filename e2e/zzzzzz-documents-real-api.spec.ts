import { expect, request, test, type Browser, type Page } from "@playwright/test";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

type Fixture = { documents: { approver: string; backup: string; requester: string; password: string } };
const fixture = JSON.parse(readFileSync(path.join(import.meta.dirname, ".real-api-fixture.json"), "utf8")) as Fixture;
const API = "http://127.0.0.1:8788";
const ORIGIN = "http://127.0.0.1:4175";
const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

/** One signed Trendhome event: TEST curtain order with a printable delivery identity. */
async function ingest(number: string, meters: number, minute: number) {
  const body = JSON.stringify({ schemaVersion: 1, eventId: `dashboard-doc-${number}-${minute}`, changedAt: new Date(Date.now() - 3_600_000 + minute * 60_000).toISOString().replace(/\.\d{3}Z$/, "Z"),
    order: { id: number, number, status: { code: "processing", label: "Se procesează" }, availability: "active",
      items: [{ id: Number(number) * 10 + 1, line: 1, name: "Draperie Velvet", sku: "DV-302", color: "Bej", width: 300, height: 260, unit: "cm", meters, quantity: 1 }],
      delivery: { name: "TEST Client", street: "Str. Test 1", city: "Cluj-Napoca", country: "RO", phone: "0722000111" } },
    production: { workflowKey: "curtain-production", workflowVersion: 1, stageId: "material-preparation" } });
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = "v1=" + createHmac("sha256", "trendhome-integration-secret-0123456789abcdef").update(`${timestamp}.${body}`).digest("hex");
  const response = await fetch(`${API}/integrations/sources/trendhome/orders`, { method: "POST", headers: { "Content-Type": "application/json", "X-Arasya-Timestamp": timestamp, "X-Arasya-Signature": signature }, body });
  expect((await response.json()).outcome).toBe("applied");
}

async function apiUser(username: string) {
  const context = await request.newContext({ baseURL: API, extraHTTPHeaders: { Origin: ORIGIN } });
  const login = await context.post("/auth/login", { data: { username, password: fixture.documents.password } });
  expect(login.status()).toBe(200);
  const csrf = (await login.json()).csrfToken as string;
  let counter = 0;
  const post = async (url: string, data: unknown) => {
    counter += 1;
    const response = await context.post(url, { data, headers: { "X-CSRF-Token": csrf, "Idempotency-Key": `dash-doc-${username.replace(/[^A-Za-z0-9]/g, "-")}-${Date.now()}-${counter}` } });
    expect(response.status(), await response.text()).toBeLessThan(300);
    return response.json();
  };
  return { context, post };
}

async function signIn(browser: Browser, username: string, width = 1440) {
  const context = await browser.newContext({ viewport: { width, height: 900 }, reducedMotion: "reduce" });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await page.getByLabel("Nume utilizator").fill(username);
  await page.getByLabel("Parolă").fill(fixture.documents.password);
  await page.getByRole("button", { name: "Intră în cont" }).click();
  // The revision approver (and the scoped backup) start on their first section: Revizii documente.
  await expect(page).toHaveURL(/\/revizii-documente$/);
  await expect(page.getByRole("heading", { name: "Revizii documente" })).toBeVisible();
  await page.evaluate(() => { (window as unknown as { __noReload: boolean }).__noReload = true; });
  return { context, page, errors };
}

test("document revision: approver and scoped backup see the diff, first decision wins live, history is complete", async ({ browser }) => {
  test.setTimeout(150_000);
  const number = "96001";
  const orderId = `trendhome:${number}`;
  await ingest(number, 8, 1);
  const online = await apiUser(fixture.documents.requester);
  const doc = `/production-documents/orders/${encodeURIComponent(orderId)}`;
  await online.post(`${doc}/generate`, { expectedDocumentVersion: 0 });
  await ingest(number, 10, 2);
  const state = await (await online.context.get(doc)).json();
  expect(state.status).toBe("stale");

  const sinem = await signIn(browser, fixture.documents.approver);
  const backup = await signIn(browser, fixture.documents.backup, 390);
  await expect(backup.page.getByText("Aprobi ca înlocuitor temporar")).toBeVisible();
  // Operations approvals are not in the document approver's navigation.
  await expect(sinem.page.getByRole("link", { name: /^Aprobări/ })).toHaveCount(0);

  const requested = await online.post(`${doc}/revision-requests`, { expectedDocumentVersion: state.version, comment: "Clientul a schimbat metrajul." });
  const requestId = requested.request.id as string;
  // The approver is told live and opens the request from the notice, without a reload.
  const notice = sinem.page.locator(".live-notice");
  await expect(notice).toContainText(`comanda ${number}, REVIZIA 2`, { timeout: 15_000 });
  await notice.getByRole("button", { name: "Deschide" }).click();
  await expect(sinem.page.getByRole("heading", { name: `Comanda ${number} · REVIZIA 2` })).toBeVisible();
  const diff = sinem.page.locator(".document-diff");
  await expect(diff).toContainText("Metri (linie)");
  await expect(diff).toContainText("8 m");
  await expect(diff).toContainText("10 m");
  await expect(sinem.page.locator("main")).not.toContainText(/@|preț|RON|plată/);
  await expect(sinem.page.getByRole("button", { name: "Revocă documentul activ" })).toHaveCount(0);

  // The backup opens the same request and approves first; the primary approver's page resolves live.
  await backup.page.evaluate((target) => { window.history.pushState({}, "", target); window.dispatchEvent(new PopStateEvent("popstate")); }, `/revizii-documente/cerere/${requestId}`);
  await backup.page.getByRole("button", { name: "Aprobă revizia" }).click();
  await backup.page.getByRole("dialog").getByRole("button", { name: "Aprobă revizia" }).click();
  await expect(backup.page.getByText("Aprobată").first()).toBeVisible();
  await expect(sinem.page.getByText("Cererea a fost deja soluționată de Bogdan Înlocuitor.")).toBeVisible({ timeout: 15_000 });
  await expect(sinem.page.getByRole("button", { name: "Aprobă revizia" })).toHaveCount(0);

  // A rejection needs a reason; the requester then generates revision 2; history shows every step.
  await online.post(`${doc}/generate`, { expectedDocumentVersion: (await (await online.context.get(doc)).json()).version, requestId });
  await sinem.page.getByRole("button", { name: "Documente de producție" }).click();
  await expect(sinem.page.getByRole("heading", { name: `Documente de producție · Comanda ${number}` })).toBeVisible();
  const history = sinem.page.locator(".timeline");
  for (const step of ["Document generat", "Datele de producție s-au schimbat", "Revizie cerută", "Revizie aprobată", "Revizie înlocuită", "Revizie generată"]) await expect(history).toContainText(step);
  await expect(sinem.page.locator("main")).toContainText("Aprobat de: Bogdan Înlocuitor");

  for (const session of [sinem, backup]) {
    for (const width of [1440, 1024, 768, 390, 360]) {
      await session.page.setViewportSize({ width, height: 900 });
      await expect.poll(() => overflow(session.page), { message: `no horizontal overflow at ${width}`, timeout: 3_000 }).toBeLessThanOrEqual(0);
    }
    expect(await session.page.evaluate(() => (window as unknown as { __noReload?: boolean }).__noReload)).toBe(true);
    expect(session.errors).toEqual([]);
  }
  await online.context.dispose();
  await sinem.context.close();
  await backup.context.close();
});

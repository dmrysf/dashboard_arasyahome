import { expect, request, test, type Browser, type Page } from "@playwright/test";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

type Fixture = { exceptions: { password: string; managers: { username: string; name: string }[]; cutter: string; intake: string } };
const fixture = JSON.parse(readFileSync(path.join(import.meta.dirname, ".real-api-fixture.json"), "utf8")) as Fixture;
const API = "http://127.0.0.1:8788";
const ORIGIN = "http://127.0.0.1:4175";
const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

async function ingest(number: string) {
  const items = [[1, "Voal A", 5], [2, "Draperie D", 9], [3, "Draperie C", 8]].map(([line, name, meters]) => ({ id: Number(number) * 10 + Number(line), line, name, sku: `EX-${line}`, color: "Ivory", width: 300, height: 260, unit: "cm", meters, quantity: 2 }));
  const body = JSON.stringify({ schemaVersion: 1, eventId: `dashboard-e2e-ex-${number}`, changedAt: new Date(Date.now() - 60_000).toISOString().replace(/\.\d{3}Z$/, "Z"),
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
    const response = await context.post(url, { data, headers: { "X-CSRF-Token": csrf, "Idempotency-Key": `dash-e2e-${username.replace(/[^A-Za-z0-9]/g, "-")}-${Date.now()}-${counter}` } });
    expect(response.status(), await response.text()).toBeLessThan(300);
    return response.json();
  };
  return { context, post };
}

/** Ingests an order and drives it through cutting, intake, report (lines D + C = 17 m) and acknowledgment. */
async function pendingRequest(number: string) {
  const qr = await ingest(number);
  const cutter = await staff(fixture.exceptions.cutter);
  const intake = await staff(fixture.exceptions.intake);
  const id = encodeURIComponent(`trendhome:${number}`);
  await cutter.post(`/orders/${id}/claim`, { expectedVersion: 1 });
  await cutter.post(`/orders/${id}/transition`, { expectedVersion: 2 });
  const order = await intake.post(`/orders/${id}/claim`, { expectedVersion: 3 });
  const itemIds = order.products.filter((item: { name: string }) => item.name !== "Voal A").map((item: { id: string }) => item.id);
  const reported = await intake.post(`/orders/${id}/fault-reports`, { expectedVersion: order.productionVersion, itemIds, reasonKey: "wrong-cut" });
  await cutter.post(`/production-exceptions/${reported.id}/acknowledge`, { expectedVersion: 1, confirmed: true, qrToken: qr });
  await cutter.context.dispose();
  await intake.context.dispose();
  return reported.id as string;
}

async function manager(browser: Browser, username: string, width: number, height: number) {
  const context = await browser.newContext({ viewport: { width, height }, reducedMotion: "reduce" });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await page.getByLabel("Nume utilizator").fill(username);
  await page.getByLabel("Parolă").fill(fixture.exceptions.password);
  await page.getByRole("button", { name: "Intră în cont" }).click();
  await expect(page).toHaveURL(/\/aprobari$/);
  await page.evaluate(() => { (window as unknown as { __noReload: boolean }).__noReload = true; });
  return { context, page, errors };
}

test("operations managers: narrow navigation, one approval wins, the other screen updates live, exact search only", async ({ browser }) => {
  test.setTimeout(150_000);
  const first = await pendingRequest("91001");
  const [denisaUser, hikmetUser] = fixture.exceptions.managers;
  const denisa = await manager(browser, denisaUser.username, 1440, 900);
  const hikmet = await manager(browser, hikmetUser.username, 390, 844);

  // Both managers have exactly the same narrow navigation.
  for (const who of [denisa, hikmet]) {
    if ((await who.page.viewportSize())!.width < 900) await who.page.getByRole("button", { name: "Meniu" }).click();
    await expect(who.page.getByRole("navigation", { name: "Navigare principală" }).getByRole("link")).toHaveText([/^Aprobări\d*$/, "În așteptare", "Aprobările mele", "Caută comandă"]);
    // Choosing a section closes the phone menu (the open sidebar covers the toggle).
    if ((await who.page.viewportSize())!.width < 900) await who.page.getByRole("navigation", { name: "Navigare principală" }).getByRole("link", { name: /^Aprobări( \d+ în așteptare)?$/ }).click();
  }
  // Direct links to management areas render no data for them.
  await hikmet.page.goto("/angajati");
  await expect(hikmet.page.getByRole("heading", { level: 1 })).toBeVisible();
  await expect(hikmet.page.locator("table")).toHaveCount(0);
  await hikmet.page.goto("/aprobari");
  await hikmet.page.evaluate(() => { (window as unknown as { __noReload: boolean }).__noReload = true; });

  await expect(denisa.page.getByRole("button", { name: /Comanda 91001/ })).toContainText("17 m");
  await denisa.page.getByRole("button", { name: /Comanda 91001/ }).click();
  await hikmet.page.getByRole("button", { name: /Comanda 91001/ }).click();
  await expect(hikmet.page.getByRole("button", { name: "Aprobă returnarea la tăiere" })).toBeVisible();
  await expect(denisa.page.getByText("Draperie D")).toBeVisible();

  await denisa.page.getByRole("button", { name: "Aprobă returnarea la tăiere" }).click();
  await denisa.page.getByRole("dialog").getByRole("button", { name: "Aprobă returnarea la tăiere" }).click();
  await expect(denisa.page.getByText("Aprobată").first()).toBeVisible();

  // Hikmet's open screen closes the decision without a refresh.
  await expect(hikmet.page.getByRole("button", { name: "Aprobă returnarea la tăiere" })).toHaveCount(0, { timeout: 15_000 });
  await expect(hikmet.page.getByText(`Cererea a fost rezolvată de ${denisaUser.name}.`)).toBeVisible();
  expect(await hikmet.page.evaluate(() => (window as unknown as { __noReload?: boolean }).__noReload)).toBe(true);

  // A new request appears live in the queue, with a visible notice and counter.
  await hikmet.page.getByRole("button", { name: "← Aprobări" }).click();
  await expect(hikmet.page.getByText("Nicio cerere în această listă.")).toBeVisible();
  const second = await pendingRequest("91002");
  await expect(hikmet.page.locator(".live-notice")).toContainText("Cerere nouă de aprobare: comanda 91002.", { timeout: 15_000 });
  await expect(hikmet.page.getByRole("button", { name: /Comanda 91002/ })).toBeVisible();
  await expect(hikmet.page.locator(".topbar-count")).toHaveText("1 în așteptare");
  expect(second).not.toBe(first);

  // Exact search: a prefix finds nothing, the exact number opens the operational order with its history.
  await hikmet.page.goto("/cauta-comanda");
  await hikmet.page.getByLabel("Număr comandă").fill("9100");
  await hikmet.page.getByRole("button", { name: "Caută" }).click();
  await expect(hikmet.page.getByText("Nicio comandă cu acest număr exact.")).toBeVisible();
  await hikmet.page.getByLabel("Număr comandă").fill("91001");
  await hikmet.page.getByRole("button", { name: "Caută" }).click();
  await expect(hikmet.page.getByRole("heading", { name: "Comanda 91001" })).toBeVisible();
  await expect(hikmet.page.getByText(/EX-000\d+ · Tăiere greșită · 17 m/)).toBeVisible();

  await denisa.page.goto("/aprobari/istoric");
  await expect(denisa.page.getByRole("button", { name: /Comanda 91001/ })).toBeVisible();

  for (const [width, height] of [[360, 740], [390, 844], [768, 1024], [1024, 768], [1440, 900]]) {
    await hikmet.page.setViewportSize({ width, height });
    expect(await overflow(hikmet.page), `overflow at ${width}`).toBeLessThanOrEqual(0);
  }
  expect(await hikmet.page.evaluate(() => [Object.keys(localStorage).filter((key) => /token|session|csrf/i.test(key)), sessionStorage.length])).toEqual([[], 0]);
  expect(denisa.errors).toEqual([]);
  expect(hikmet.errors).toEqual([]);
  await denisa.context.close();
  await hikmet.context.close();
});

import { expect, test, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";
import type { EmployeeReport, OrderDetailReport, OrderPage } from "../src/api/analytics";

type Fixture = { root: { username: string }; analytics: { readerId: string; readerUsername: string; readerPassword: string; roleId: number }; exceptions: { managers: { username: string }[]; password: string } };
const fixture = JSON.parse(readFileSync(path.join(import.meta.dirname, ".real-api-fixture.json"), "utf8")) as Fixture;
const API = "http://127.0.0.1:8788";
test.describe.configure({ mode: "serial" });
let root: Page;
let orderId = "";
let workerId = "";
async function login(page: Page, username: string, password: string) {
  await page.goto("/"); await page.getByLabel("Nume utilizator").fill(username); await page.getByLabel("Parolă", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Intră în cont" }).click();
}
async function http<T>(page: Page, method: string, pathname: string, body?: unknown): Promise<{ status: number; body: T }> {
  return await page.evaluate(async ({ method, pathname, body, api }) => {
    const headers: Record<string, string> = {};
    if (method !== "GET") {
      const session = await (await fetch(`${api}/auth/session`, { credentials: "include" })).json() as { csrfToken: string };
      headers["Content-Type"] = "application/json"; headers["X-CSRF-Token"] = session.csrfToken; headers["Idempotency-Key"] = `analytics-e2e-${crypto.randomUUID()}`;
    }
    const response = await fetch(`${api}${pathname}`, { method, credentials: "include", headers, body: body === undefined ? undefined : JSON.stringify(body) });
    return { status: response.status, body: await response.json() };
  }, { method, pathname, body, api: API }) as { status: number; body: T };
}
const overflow = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
test.beforeAll(async ({ browser }) => {
  root = await (await browser.newContext({ timezoneId: "America/New_York" })).newPage();
  root.on("pageerror", error => { throw error; });
  await login(root, fixture.root.username, "root e2e permanent passphrase 2026");
  await expect(root.locator(".sidebar").getByRole("link", { name: "Analiză managerială", exact: true })).toBeVisible();
});
test.afterAll(async () => { await root.context().close(); });

test("analytics sections use Romanian facts, server ranges and a read-only browser surface", async () => {
  const orders = await http<OrderPage>(root, "GET", "/management/analytics/orders?period=month&limit=100"); expect(orders.status).toBe(200);
  expect(orders.body.items[0].createdAt).toMatch(/Z$/);
  orderId = orders.body.items.find(o => o.completedAt !== null)!.id;
  const employees = await http<EmployeeReport>(root, "GET", "/management/analytics/employees?period=month&limit=100"); expect(employees.status).toBe(200);
  workerId = employees.body.items.find(e => e.stageCompletions.delivery)?.id ?? employees.body.items[0].id;
  const writes: string[] = []; root.on("request", r => { if (r.url().includes("/management/analytics") && r.method() !== "GET") writes.push(r.method()); });
  for (const [route, title] of [["angajati", "Angajați"], ["departamente", "Departamente"], ["aprobari", "Aprobări"], ["surse", "Surse"], ["firme", "Firme B2B"], ["comenzi", "Ciclul comenzilor"]]) {
    await root.goto(`/analiza/${route}`); await expect(root.getByRole("heading", { name: `Analiză managerială · ${title}`, exact: true })).toBeVisible();
    await expect(root.getByText(/Momentul raportului:/)).toBeVisible(); await expect(root.getByRole("alert")).toHaveCount(0);
  }
  await root.goto("/analiza/angajati"); await root.getByLabel("Caută angajat").fill("Ana Croitor"); await root.getByRole("button", { name: "Aplică", exact: true }).click();
  await expect(root.locator(".analytics-employee")).toHaveCount(1); await expect(root.locator(".analytics-employee h2")).toHaveText("Ana Croitor");
  await root.screenshot({ path: test.info().outputPath("analytics-desktop.png") });
  await root.getByLabel("Perioadă", { exact: true }).selectOption("custom"); await root.getByLabel("De la", { exact: true }).fill("2026-03-29"); await root.getByLabel("Până la", { exact: true }).fill("2026-03-29");
  await root.getByRole("button", { name: "Aplică", exact: true }).click(); await expect(root.getByText(/Momentul raportului:/)).toBeVisible();
  await root.locator(".analytics-employee h2 a").click(); expect(new URL(root.url()).searchParams.get("from")).toBe("2026-03-29");
  await expect(root.getByRole("heading", { name: "Evoluție zilnică", exact: true })).toBeVisible(); expect(writes).toEqual([]);
});
test("employee, manager, order and company layouts fit 1440/1024/768/390/360 and reduced motion", async () => {
  await root.emulateMedia({ reducedMotion: "reduce" });
  for (const width of [1440, 1024, 768, 390, 360]) {
    await root.setViewportSize({ width, height: 900 });
    for (const route of [`angajati/${workerId}`, "aprobari", "surse", `comenzi/${orderId}`]) {
      await root.goto(`/analiza/${route}`); await expect(root.getByText(/Momentul raportului:/)).toBeVisible(); expect(await overflow(root), `${route} at ${width}`).toBeLessThanOrEqual(1);
    }
  }
  await root.screenshot({ path: test.info().outputPath("analytics-mobile.png") });
  await root.getByRole("button", { name: "TR — Türkçe", exact: true }).click(); await expect(root.getByRole("heading", { name: "Yönetim analizi · Sipariş yaşam döngüsü", exact: true })).toBeVisible();
  await expect(root.getByRole("heading", { name: "Kanonik zaman çizelgesi", exact: true })).toBeVisible();
  await root.getByRole("button", { name: "RO — Română", exact: true }).click();
  const detail = await http<OrderDetailReport>(root, "GET", `/management/analytics/orders/${orderId}`); expect(detail.body.order.documentCreatedAt).toBeNull();
  expect(detail.body.asOf).toMatch(/Z$/); expect(detail.body.order.completedAt).toMatch(/Z$/);
  const romanianTime = await root.evaluate(stamp => new Intl.DateTimeFormat("ro-RO", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Bucharest" }).format(new Date(stamp)), detail.body.order.completedAt!);
  await expect(root.getByText(romanianTime, { exact: true }).first()).toBeVisible();
  expect(detail.body.lifecycle.qrToCompletion).not.toBeNull(); expect(detail.body.order.completedAt).not.toBeNull();
  await root.setViewportSize({ width: 1440, height: 900 });
});
test("explicit analytics reader can analyze but cannot administer IAM, TV or Root policy", async ({ browser }) => {
  expect((await http(root, "PUT", `/management/employees/${fixture.analytics.readerId}/applications`, { applications: ["dashboard"] })).status).toBe(200);
  expect((await http(root, "PUT", `/management/employees/${fixture.analytics.readerId}/roles`, { roleIds: [fixture.analytics.roleId] })).status).toBe(200);
  const reader = await (await browser.newContext()).newPage(); await login(reader, fixture.analytics.readerUsername, fixture.analytics.readerPassword);
  await expect(reader.getByRole("heading", { name: "Analiză managerială · Angajați", exact: true })).toBeVisible();
  for (const label of ["Roluri", "Dispozitive de afișare", "Toleranță aprobare"]) await expect(reader.locator(".sidebar").getByRole("link", { name: label, exact: true })).toHaveCount(0);
  expect((await http(reader, "GET", "/management/employees")).status).toBe(403);
  expect((await http(reader, "PUT", "/management/analytics/policy", { approvalGraceMinutes: 0, expectedVersion: 1 })).status).toBe(403);
  await reader.goto("/analiza/politica"); await expect(reader.getByRole("alert")).toBeVisible();
  const manager = await (await browser.newContext()).newPage(); await login(manager, fixture.exceptions.managers[0].username, fixture.exceptions.password);
  await expect(manager).toHaveURL(/\/aprobari$/);
  await expect(manager.locator(".sidebar").getByRole("link", { name: "Analiză managerială", exact: true })).toHaveCount(0);
  for (const endpoint of ["employees", "departments", "managers", "sources", "companies", "orders", "policy"]) expect((await http(manager, "GET", `/management/analytics/${endpoint}`)).status).toBe(403);
  await manager.goto("/analiza/angajati"); await expect(manager.getByRole("alert")).toBeVisible();
  await manager.context().close(); await reader.context().close();
});
test("B2B company lifecycle groups canonical manufacturing lines without quantity multiplication or finance leakage", async () => {
  const company = await http<{ companyId: string }>(root, "POST", "/b2b/companies", { legalName: "Firma analiză · fixture", countryCode: "RO", taxIdentifier: "ANALYTICSE2E", contact: { name: "Contact fixture", isPrimary: true }, address: { type: "delivery", countryCode: "RO", city: "Oraș fixture", addressLine1: "Adresă fixture", isPrimary: true } }); expect(company.status).toBe(201);
  const identity = await http<{ contacts: { id: string }[]; addresses: { id: string }[] }>(root, "GET", `/b2b/companies/${company.body.companyId}`);
  const draft = await http<{ detail: { order: { id: string; version: number; code: string } } }>(root, "POST", "/b2b/orders", { companyId: company.body.companyId, currencyCode: "RON", contactId: identity.body.contacts[0].id, deliveryAddressId: identity.body.addresses[0].id, lines: [{ productCode: "CURTAIN", productName: "Voal fixture", variant: "Wave", color: "Alb", kind: "curtain", width: "200", height: "260", quantity: 2, meters: "12.300", pricingUnit: "meter", unitPriceNet: "10.00", discountPercent: "0", vatPercent: "19", notes: null, productionNotes: null }] }); expect(draft.status).toBe(201);
  const finalized = await http<{ detail: { order: { id: string; version: number } } }>(root, "POST", `/b2b/orders/${draft.body.detail.order.id}/finalize`, { expectedVersion: draft.body.detail.order.version }); expect(finalized.status).toBe(200);
  expect((await http(root, "POST", `/b2b/orders/${finalized.body.detail.order.id}/production`, { expectedVersion: finalized.body.detail.order.version })).status).toBe(201);
  await root.goto(`/analiza/firme/${company.body.companyId}`); await expect(root.getByText("12.300", { exact: true }).first()).toBeVisible();
  await expect(root.getByText(/Tipul firmă \/ persoană fizică/)).toBeVisible(); await expect(root.locator("body")).not.toContainText("Contact fixture"); await expect(root.locator("body")).not.toContainText("Adresă fixture");
  for (const width of [1440, 1024, 768, 390, 360]) { await root.setViewportSize({ width, height: 900 }); expect(await overflow(root)).toBeLessThanOrEqual(1); }
  await root.getByRole("link", { name: draft.body.detail.order.code, exact: true }).click(); await expect(root.getByText("Predare B2B în producție", { exact: true })).toBeVisible(); await expect(root.getByText("12.300", { exact: true })).toBeVisible();
});

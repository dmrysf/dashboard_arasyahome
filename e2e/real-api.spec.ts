import { expect, test, type Browser, type Page } from "@playwright/test";
import { createHmac } from "node:crypto";
import { readFileSync } from "node:fs";
import path from "node:path";

type Fixture = {
  root: { id: string; username: string; password: string };
  role: { id: number; name: string };
  stage: { id: string; label: string };
  department: { id: number; name: string };
  control: { order: string; number: string; worker: { username: string; password: string; name: string } };
  production: {
    summary: Record<"active" | "waiting" | "inWork" | "unassigned" | "completedToday", number>;
    stages: Record<string, number>;
    oldest: string[];
    sources: Record<string, string>;
  };
};

const fixture = JSON.parse(readFileSync(path.join(import.meta.dirname, ".real-api-fixture.json"), "utf8")) as Fixture;
const API = "http://127.0.0.1:8788";
const ROOT_PASSWORD = "root e2e permanent passphrase 2026";
const EMPLOYEE_PASSWORD = "angajat e2e passphrase 2026";
const EMPLOYEE = { name: "Test Angajat IAM", username: "test.angajat.iam" };

test.describe.configure({ mode: "serial" });

const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

let root: Page;
let employeeId = "";
let temporaryPassword = "";

async function login(page: Page, username: string, password: string) {
  await page.goto("/");
  await page.getByLabel("Nume utilizator").fill(username);
  await page.getByLabel("Parolă").fill(password);
  await page.getByRole("button", { name: "Intră în cont" }).click();
}

async function changePassword(page: Page, current: string, next: string) {
  await expect(page.getByRole("heading", { name: "Schimbă parola" })).toBeVisible();
  await page.getByLabel("Parola actuală").fill(current);
  await page.getByLabel("Parola nouă", { exact: true }).fill(next);
  await page.getByLabel("Confirmă parola nouă").fill(next);
  await page.getByRole("button", { name: "Salvează parola" }).click();
}

async function review(page: Page, open: string, confirm: string) {
  await page.getByRole("button", { name: open }).click();
  await page.getByRole("dialog").getByRole("button", { name: confirm }).click();
  await expect(page.getByText("Modificarea a fost salvată")).toBeVisible();
}

async function newEmployeePage(browser: Browser) {
  const context = await browser.newContext();
  const page = await context.newPage();
  page.on("pageerror", (error) => { throw error; });
  return page;
}

test.beforeAll(async ({ browser }) => {
  root = await newEmployeePage(browser);
});

test("1-4 root logs in with the bootstrap password, is forced to change it, then the Dashboard opens", async () => {
  await login(root, fixture.root.username, fixture.root.password);
  await changePassword(root, fixture.root.password, ROOT_PASSWORD);
  await expect(root.getByRole("heading", { name: /^Bună, Administrator\./ })).toBeVisible();
  await expect(root.locator(".sidebar .root-badge")).toHaveText(/Administrator principal/);
  expect(await root.evaluate(() => [localStorage.length, sessionStorage.length])).toEqual([0, 0]);
});

test("production overview shows the real API aggregates, translates in place and never writes", async () => {
  const writes: string[] = [];
  const overviewRequests: string[] = [];
  const track = (request: import("@playwright/test").Request) => {
    if (!request.url().startsWith(API)) return;
    if (request.method() !== "GET") writes.push(`${request.method()} ${new URL(request.url()).pathname}`);
    if (request.url().includes("/management/production-overview")) overviewRequests.push(request.url());
  };
  root.on("request", track);
  await root.goto("/");
  const production = root.locator("section.production");
  await expect(production.getByRole("heading", { name: "Producție", exact: true })).toBeVisible();
  const metric = (key: string) => production.locator(`[data-metric="${key}"] strong`);
  for (const [key, value] of Object.entries(fixture.production.summary)) await expect(metric(key)).toHaveText(String(value));
  await expect(production.locator("[data-stage]")).toHaveCount(14);
  for (const [stage, count] of Object.entries(fixture.production.stages)) await expect(production.locator(`[data-stage="${stage}"] .pipeline-count`)).toHaveText(String(count));
  await expect(production.locator("[data-order]")).toHaveCount(fixture.production.oldest.length);
  expect(await production.locator("[data-order]").evaluateAll((rows) => rows.map((row) => row.getAttribute("data-order")))).toEqual(fixture.production.oldest);
  await expect(production.locator('[data-order="60003"]')).toContainText("Ana Croitor");
  await expect(production.locator("[data-action]")).toHaveCount(3);
  await expect(production.locator('[data-action="production_completed"]')).toContainText("A finalizat producția 60006");
  for (const [source, health] of Object.entries(fixture.production.sources)) await expect(production.locator(`[data-source="${source}"]`)).toHaveAttribute("data-health", health);
  await expect(production.locator('[data-source="trendyol"]')).toContainText("Neconfigurat");

  const before = overviewRequests.length;
  await production.getByRole("button", { name: "Actualizează" }).click();
  await expect.poll(() => overviewRequests.length).toBe(before + 1);
  await expect(production.getByText(/^Actualizat la \d{2}:\d{2}:\d{2}$/)).toBeVisible();

  await root.getByRole("button", { name: "TR — Türkçe" }).click();
  await expect(production.getByRole("heading", { name: "Üretim", exact: true })).toBeVisible();
  await expect(production.locator('[data-metric="active"] span')).toHaveText("Aktif Siparişler");
  await expect(metric("active")).toHaveText(String(fixture.production.summary.active));
  await expect(production.locator('[data-source="trendhome"]')).toContainText("Çevrimiçi");
  expect(overviewRequests.length, "a language switch re-renders, it does not refetch").toBe(before + 1);

  await root.reload();
  await expect(production.getByRole("heading", { name: "Üretim", exact: true })).toBeVisible();
  await expect(metric("active")).toHaveText(String(fixture.production.summary.active));
  await expect(root.getByRole("heading", { name: /^Merhaba, Administrator\./ })).toBeVisible();

  await production.getByLabel("Kaynak").selectOption("outletperdele");
  await expect(metric("active")).toHaveText("1");
  expect(overviewRequests.at(-1)).toContain("source=outletperdele");
  await production.getByLabel("Kaynak").selectOption("");
  await root.getByRole("button", { name: "RO — Română" }).click();
  await expect(metric("active")).toHaveText(String(fixture.production.summary.active));
  root.off("request", track);
  expect(writes, "the overview is read-only").toEqual([]);
  expect(await root.evaluate(() => Object.keys(localStorage))).toEqual(["arasya.dashboard.locale"]);
});

/** A signed Trendhome commerce event, exactly as the WooCommerce connector sends it (inbound only). */
async function trendhomeEvent(eventId: string, status: { code: string; label: string }) {
  const body = JSON.stringify({
    schemaVersion: 1, eventId, changedAt: new Date().toISOString().replace(/\.\d{3}Z$/, "Z"),
    order: {
      id: "90001", number: "90001", status, availability: "active", notes: "Tiv dublu la bază.", acceptedAt: new Date(Date.now() - 3_600_000).toISOString().replace(/\.\d{3}Z$/, "Z"),
      items: [
        { id: 900011, line: 1, name: "Draperie Blackout", sku: "BO-210", variant: "Rejansă cu inele", color: "Gri", width: 320, height: 270.5, unit: "cm", meters: 9.6, quantity: 2 },
        { id: 900012, line: 2, name: "Perdea In", sku: null, color: null, width: null, height: null, unit: null, meters: null, quantity: 1 },
      ],
    },
    // A stale source stage hint must not move production that Operations already owns.
    production: { workflowKey: "curtain-production", workflowVersion: 1, stageId: "delivery" },
  });
  const timestamp = String(Math.floor(Date.now() / 1000));
  const signature = "v1=" + createHmac("sha256", "trendhome-integration-secret-0123456789abcdef").update(`${timestamp}.${body}`).digest("hex");
  const response = await fetch(`${API}/integrations/sources/trendhome/orders`, { method: "POST", headers: { "Content-Type": "application/json", "X-Arasya-Timestamp": timestamp, "X-Arasya-Signature": signature }, body });
  expect(response.status).toBe(200);
  expect((await response.json()).outcome).toBe("applied");
}

test("production control: list, detail, Staff progress, independent commerce updates, RO/TR and mobile", async ({ browser }) => {
  const control = fixture.control;
  const external: string[] = [];
  const rootWrites: string[] = [];
  const watch = (request: import("@playwright/test").Request) => {
    const url = new URL(request.url());
    if (url.hostname !== "127.0.0.1") external.push(request.url());
    if (request.url().startsWith(API) && request.method() !== "GET") rootWrites.push(`${request.method()} ${url.pathname}`);
  };
  root.on("request", watch);

  // 1-5: the controlled Trendhome order appears with its store status and an independent production start.
  await root.getByRole("navigation").getByRole("link", { name: "Comenzi", exact: true }).click();
  await expect(root.getByRole("heading", { name: "Comenzi", exact: true })).toBeVisible();
  const row = root.locator(`tr[data-order="${control.order}"]`);
  await expect(row.locator('[data-kind="commerce"]')).toHaveText(/Se procesează/);
  await expect(row.locator('[data-kind="production"]')).toHaveText(/În așteptare/);
  await expect(row).toContainText("Fără responsabil");
  await root.getByLabel("Sursă").selectOption("trendhome");
  await expect(root.locator("tr[data-order]"), "default filter shows active production only").toHaveCount(4);
  await root.getByLabel("Caută").fill("90001");
  await root.getByRole("button", { name: "Caută", exact: true }).click();
  await expect(root.locator("tr[data-order]")).toHaveCount(1);
  await row.getByRole("link", { name: control.number }).click();
  await expect(root).toHaveURL(/\/comenzi\/trendhome%3A90001$/);
  const commerce = root.locator('[data-section="commerce"]');
  const production = root.locator('[data-section="production"]');
  await expect(commerce).toContainText("Se procesează");
  await expect(production).toContainText("În așteptare");
  await expect(production).toContainText("Fără responsabil");
  await expect(root.locator('[data-item="1"]')).toContainText("Draperie Blackout");
  await expect(root.locator('[data-item="1"]')).toContainText("320 cm");
  await expect(root.locator('[data-item="1"]')).toContainText("270,5 cm");
  await expect(root.locator('[data-item="1"]')).toContainText("9,6 m");
  await expect(root.locator('[data-item="2"]')).toContainText("Perdea In");
  await expect(root.getByText("Tiv dublu la bază.")).toBeVisible();
  await expect(root.locator("[data-event]")).toHaveCount(1);

  // 6-9: a Staff employee claims and completes the waiting stage through the real API.
  const worker = await newEmployeePage(browser);
  await worker.goto("/");
  const staffAction = (path: string, body: unknown) => worker.evaluate(async ({ api, path, body, username, password }) => {
    let session = await fetch(`${api}/auth/session`, { credentials: "include" });
    if (session.status !== 200) session = await fetch(`${api}/auth/login`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ username, password }) });
    const { csrfToken } = await session.json();
    const response = await fetch(`${api}${path}`, { method: "POST", credentials: "include", headers: { "Content-Type": "application/json", "X-CSRF-Token": csrfToken, "Idempotency-Key": `e2e-${crypto.randomUUID()}` }, body: JSON.stringify(body) });
    return response.status;
  }, { api: API, path, body, username: control.worker.username, password: control.worker.password });
  const orderApiPath = `/orders/${encodeURIComponent(control.order)}`;
  expect(await staffAction(`${orderApiPath}/claim`, { expectedVersion: 1 })).toBe(200);
  await root.getByRole("button", { name: "Actualizează" }).click();
  await expect(production).toContainText(control.worker.name);
  await expect(root.locator('[data-event="claimed"]')).toContainText(control.worker.name);
  expect(await staffAction(`${orderApiPath}/transition`, { expectedVersion: 2 })).toBe(200);
  await root.getByRole("button", { name: "Actualizează" }).click();
  await expect(production.locator('[data-kind="production"]')).toHaveText(/Pregătire material/);
  await expect(production).toContainText("Fără responsabil");
  await expect(root.locator('[data-event="stage_completed"]')).toContainText("Din: În așteptare → Către: Pregătire material");
  // 10: the store status stored in Operations is untouched by production.
  await expect(commerce).toContainText("Se procesează");

  // 11-14: a new Trendhome commerce event updates the store status and nothing else.
  await trendhomeEvent("dashboard-e2e-90001-2", { code: "shipped", label: "Expediat" });
  await root.getByRole("button", { name: "Actualizează" }).click();
  await expect(commerce).toContainText("Expediat");
  await expect(production.locator('[data-kind="production"]')).toHaveText(/Pregătire material/);
  expect(await root.locator("[data-event]").evaluateAll((items) => items.map((item) => item.getAttribute("data-event")))).toEqual(["imported", "claimed", "stage_completed"]);

  // 16: Turkish, in place.
  await root.getByRole("button", { name: "TR — Türkçe" }).click();
  await expect(root.getByRole("heading", { name: "Mağaza (kaynak)" })).toBeVisible();
  await expect(production.locator('[data-kind="production"]')).toHaveText(/Malzeme Hazırlığı/);
  await expect(root.locator('[data-event="stage_completed"]')).toContainText("Aşamayı tamamladı");
  await root.getByRole("button", { name: "← Siparişler" }).click();
  await expect(root.getByRole("columnheader", { name: "Mağaza Durumu" })).toBeVisible();
  await expect(root.getByRole("columnheader", { name: "Üretim Aşaması" })).toBeVisible();

  // 17: phone layout stacks the rows instead of scrolling a spreadsheet sideways.
  await root.setViewportSize({ width: 390, height: 844 });
  await expect(root.locator("tr[data-order]").first()).toBeVisible();
  expect(await root.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await root.locator(`tr[data-order="${control.order}"] a`).click();
  await expect(root.locator('[data-section="production"]')).toBeVisible();
  expect(await root.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await root.setViewportSize({ width: 1280, height: 720 });
  await root.getByRole("button", { name: "RO — Română" }).click();

  // 15: nothing left the controlled environment and the Dashboard itself wrote nothing.
  root.off("request", watch);
  expect(external, "no request to any external host").toEqual([]);
  expect(rootWrites, "the order workspace is read-only").toEqual([]);
  await worker.context().close();
});

test("old temporary root password stops working immediately", async ({ browser }) => {
  const page = await newEmployeePage(browser);
  await login(page, fixture.root.username, fixture.root.password);
  await expect(page.getByRole("alert")).toHaveText("Utilizatorul sau parola nu sunt corecte.");
  await page.context().close();
});

test("5-6 root lists employees and creates a controlled test employee with a one-time password", async () => {
  await root.getByRole("navigation").getByRole("link", { name: "Angajați" }).click();
  await expect(root.getByRole("cell", { name: "arasya.root.owner", exact: true })).toBeVisible();
  await root.getByRole("button", { name: "Angajat nou" }).click();
  await root.getByLabel("Nume complet", { exact: true }).fill(EMPLOYEE.name);
  await root.getByLabel("Nume utilizator").fill(EMPLOYEE.username);
  await root.getByLabel("Departament", { exact: true }).selectOption({ label: fixture.department.name });
  await root.getByLabel("Funcție", { exact: true }).fill("Test automat");
  // Start with no access at all; access, role and stage are granted next through the detail screen.
  await root.getByRole("checkbox", { name: "Staff (producție)" }).uncheck();
  await root.getByRole("button", { name: "Creează angajatul" }).click();
  await expect(root.getByText("Parola temporară este afișată o singură dată.")).toBeVisible();
  temporaryPassword = (await root.getByTestId("one-time-secret").textContent()) ?? "";
  expect(temporaryPassword).toHaveLength(20);
  await root.getByRole("button", { name: "Deschide fișa angajatului" }).click();
  await expect(root.getByRole("heading", { name: EMPLOYEE.name })).toBeVisible();
  employeeId = new URL(root.url()).pathname.split("/").pop() ?? "";
  expect(employeeId).toMatch(/^[0-9a-f-]{36}$/);
});

test("7-10 root grants Staff access, assigns a role and one Staff stage, and the detail reflects it", async () => {
  await root.getByRole("checkbox", { name: "Staff", exact: true }).check();
  await review(root, "Revizuiește accesul", "Aplică accesul");
  await root.getByRole("checkbox", { name: new RegExp(`^${escape(fixture.role.name)} nivel`) }).check();
  await review(root, "Revizuiește rolurile", "Aplică rolurile");
  await root.getByRole("checkbox", { name: new RegExp(`${escape(fixture.stage.label)}$`) }).check();
  await review(root, "Revizuiește etapele", "Aplică etapele");
  await root.reload();
  await expect(root.getByRole("checkbox", { name: "Staff", exact: true })).toBeChecked();
  await expect(root.getByRole("checkbox", { name: "Panou de control", exact: true })).not.toBeChecked();
  await expect(root.getByRole("checkbox", { name: new RegExp(`^${escape(fixture.role.name)} nivel`) })).toBeChecked();
  await expect(root.getByRole("checkbox", { name: new RegExp(`${escape(fixture.stage.label)}$`) })).toBeChecked();
});

test("11 the IAM audit records the management changes in Romanian", async () => {
  await root.getByRole("navigation").getByRole("link", { name: "Audit" }).click();
  await expect(root.getByText(`Administrator principal a creat contul ${EMPLOYEE.name}.`)).toBeVisible();
  await expect(root.getByText(`${EMPLOYEE.name} a primit acces la Staff.`)).toBeVisible();
  await expect(root.getByText(`Administrator principal a modificat rolurile utilizatorului ${EMPLOYEE.name}.`)).toBeVisible();
  await expect(root.getByText(`Administrator principal a modificat etapele Staff ale utilizatorului ${EMPLOYEE.name}.`)).toBeVisible();
  await expect(root.locator("body")).not.toContainText(temporaryPassword);
});

let employee: Page;

test("12 a Staff-only identity changes its temporary password and still cannot open the Dashboard", async ({ browser }) => {
  employee = await newEmployeePage(browser);
  await login(employee, EMPLOYEE.username, temporaryPassword);
  await changePassword(employee, temporaryPassword, EMPLOYEE_PASSWORD);
  await expect(employee.getByRole("heading", { name: "Nu ai acces la Panoul de control." })).toBeVisible();
});

test("13-14 granting Dashboard access applies on the next authorization request without a new login", async () => {
  await root.goto(`/angajati/${employeeId}`);
  await root.getByRole("checkbox", { name: "Panou de control", exact: true }).check();
  await review(root, "Revizuiește accesul", "Aplică accesul");
  await employee.reload();
  await expect(employee.getByRole("heading", { name: /^Bună, Test\./ })).toBeVisible();
  await expect(employee.getByRole("heading", { name: "Schimbă parola" })).toHaveCount(0);
});

test("15-16 removing Dashboard access denies the next protected request again", async () => {
  await root.getByRole("checkbox", { name: "Panou de control", exact: true }).uncheck();
  await review(root, "Revizuiește accesul", "Aplică accesul");
  // Any protected management request now fails; the app re-reads the session and shows the refusal.
  await employee.evaluate(() => window.dispatchEvent(new Event("visibilitychange")));
  await employee.goto("/");
  await expect(employee.getByRole("heading", { name: "Nu ai acces la Panoul de control." })).toBeVisible();
  const direct = await employee.evaluate(async (api) => (await fetch(`${api}/management/me`, { credentials: "include" })).status, API);
  expect(direct).toBe(403);
});

test("17-18 deactivating the user rejects its existing session", async () => {
  await root.getByRole("button", { name: "Dezactivează contul" }).click();
  await root.getByRole("dialog").getByRole("button", { name: "Dezactivează" }).click();
  await expect(root.getByText("Modificarea a fost salvată")).toBeVisible();
  const status = await employee.evaluate(async (api) => (await fetch(`${api}/auth/session`, { credentials: "include" })).status, API);
  expect(status).toBe(401);
  await employee.reload();
  await expect(employee.getByRole("heading", { name: "Autentificare" })).toBeVisible();
  await login(employee, EMPLOYEE.username, EMPLOYEE_PASSWORD);
  await expect(employee.getByRole("alert")).toBeVisible();
  await expect(employee.getByRole("heading", { name: /^Bună/ })).toHaveCount(0);
});

test("19 the root identity has no modification controls in the Dashboard", async () => {
  await root.goto(`/angajati/${fixture.root.id}`);
  await expect(root.getByText("Cont de sistem protejat.")).toBeVisible();
  for (const name of ["Dezactivează contul", "Resetează parola", "Revizuiește accesul", "Revizuiește rolurile", "Revizuiește etapele", "Salvează profilul"]) {
    await expect(root.getByRole("button", { name })).toHaveCount(0);
  }
  for (const box of await root.getByRole("checkbox").all()) await expect(box).toBeDisabled();
});

test("20 a direct API attempt to modify root is rejected with ROOT_PROTECTED, even from root", async () => {
  const results = await root.evaluate(async ({ api, rootId }) => {
    const session = await (await fetch(`${api}/auth/session`, { credentials: "include" })).json() as { csrfToken: string };
    const call = async (method: string, suffix: string, body?: unknown) => {
      const response = await fetch(`${api}/management/employees/${rootId}${suffix}`, {
        method, credentials: "include", headers: { "Content-Type": "application/json", "X-CSRF-Token": session.csrfToken }, body: body === undefined ? undefined : JSON.stringify(body),
      });
      return [response.status, ((await response.json()) as { error?: { code?: string } }).error?.code];
    };
    return [
      await call("PUT", "/applications", { applications: [] }),
      await call("POST", "/deactivate"),
      await call("PUT", "/roles", { roleIds: [] }),
      await call("POST", "/password-reset"),
    ];
  }, { api: API, rootId: fixture.root.id });
  for (const result of results) expect(result).toEqual([403, "ROOT_PROTECTED"]);
});

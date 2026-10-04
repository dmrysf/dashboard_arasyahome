import { expect, test, type Browser, type Page } from "@playwright/test";
import { readFileSync } from "node:fs";
import path from "node:path";

type Fixture = {
  root: { id: string; username: string; password: string };
  role: { id: number; name: string };
  stage: { id: string; label: string };
  department: { id: number; name: string };
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

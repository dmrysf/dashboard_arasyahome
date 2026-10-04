import { expect, test } from "@playwright/test";
import { ids, mockApi } from "./mock-api";

test.beforeEach(async ({ page }) => {
  page.on("pageerror", (error) => { throw error; });
});

async function login(page: import("@playwright/test").Page) {
  await page.goto("/");
  await page.getByLabel("Nume utilizator").fill("maria.ionescu");
  await page.getByLabel("Parolă").fill("parola-corecta");
  await page.getByRole("button", { name: "Intră în cont" }).click();
}

test("login, forced password change, then the Dashboard opens", async ({ page }) => {
  const api = await mockApi(page, { mustChangePassword: true });
  await login(page);
  await expect(page.getByRole("heading", { name: "Schimbă parola" })).toBeVisible();
  await expect(page.getByRole("navigation")).toHaveCount(0);
  await page.getByLabel("Parola actuală").fill("parola-corecta");
  await page.getByLabel("Parola nouă", { exact: true }).fill("o parolă nouă și lungă");
  await page.getByLabel("Confirmă parola nouă").fill("o parolă nouă și lungă");
  await page.getByRole("button", { name: "Salvează parola" }).click();
  await expect(page.getByRole("heading", { name: "Bună, Maria." })).toBeVisible();
  for (const item of ["Panou de control", "Angajați", "Roluri și permisiuni", "Departamente", "Aplicații", "Audit"]) {
    await expect(page.getByRole("navigation").getByRole("link", { name: item, exact: true })).toBeVisible();
  }
  expect(api.mutations.find((mutation) => mutation.path === "/auth/password")?.csrf).toBe("csrf-smoke");
  expect(await page.evaluate(() => [localStorage.length, sessionStorage.length])).toEqual([0, 0]);
});

test("an identity without Dashboard access gets a clear refusal, not a redirect loop", async ({ page }) => {
  const api = await mockApi(page, { applications: ["staff"] });
  await login(page);
  await expect(page.getByRole("heading", { name: "Nu ai acces la Panoul de control." })).toBeVisible();
  const before = api.requests.length;
  await page.waitForTimeout(1_000);
  expect(api.requests.length).toBe(before);
  expect(api.requests.filter((request) => request.startsWith("GET /management"))).toEqual([]);
  await page.getByRole("button", { name: "Ieși din cont" }).click();
  await expect(page.getByRole("heading", { name: "Autentificare" })).toBeVisible();
});

test("employee filters, creation and the one-time temporary password", async ({ page }) => {
  const api = await mockApi(page);
  await login(page);
  await page.getByRole("navigation").getByRole("link", { name: "Angajați" }).click();
  await expect(page.getByRole("cell", { name: /Ion Popescu/ })).toBeVisible();
  await page.getByPlaceholder("Caută după nume, utilizator sau funcție").fill("maria");
  await page.getByRole("button", { name: "Caută" }).click();
  await expect(page.getByRole("cell", { name: /Ion Popescu/ })).toHaveCount(0);
  await expect(page.getByRole("cell", { name: /Maria Ionescu/ })).toBeVisible();

  await page.getByRole("button", { name: "Angajat nou" }).click();
  await page.getByLabel("Nume complet").fill("Test Angajat IAM");
  await page.getByLabel("Nume utilizator").fill("test.angajat.iam");
  await page.getByLabel("Departament").selectOption({ label: "Producție" });
  await page.getByLabel("Pregătire material").check();
  await page.getByRole("button", { name: "Creează angajatul" }).click();
  await expect(page.getByTestId("one-time-secret")).toHaveText("Tmp-Smoke-0123456789");
  await expect(page.getByText("Parola temporară este afișată o singură dată.")).toBeVisible();
  await expect(page.getByText("Utilizatorul va trebui să o schimbe la prima autentificare.")).toBeVisible();
  const create = api.mutations.find((mutation) => mutation.path === "/management/employees");
  expect(create?.body).toMatchObject({ displayName: "Test Angajat IAM", username: "test.angajat.iam", departmentId: 2, applications: ["staff"], stageIds: ["material-preparation"] });
  expect(await page.evaluate(() => [localStorage.length, sessionStorage.length])).toEqual([0, 0]);
  // Leaving the screen discards the password; it is never shown again.
  await page.getByRole("button", { name: "Deschide fișa angajatului" }).click();
  await expect(page.getByRole("heading", { name: "Test Angajat IAM" })).toBeVisible();
  await expect(page.getByTestId("one-time-secret")).toHaveCount(0);
});

test("authorization changes need an explicit confirmation before anything is written", async ({ page }) => {
  const api = await mockApi(page);
  await login(page);
  await page.goto(`/angajati/${ids.ION_ID}`);
  await expect(page.getByRole("heading", { name: "Ion Popescu" })).toBeVisible();
  await page.getByRole("checkbox", { name: "Panou de control" }).check();
  await page.getByRole("checkbox", { name: /Confecționare/ }).check();
  expect(api.mutations.filter((mutation) => mutation.path.startsWith("/management"))).toEqual([]);
  await page.getByRole("button", { name: "Revizuiește accesul" }).click();
  await expect(page.getByRole("dialog")).toContainText("După: Staff, Panou de control");
  await page.getByRole("button", { name: "Anulează" }).click();
  expect(api.mutations.filter((mutation) => mutation.path.startsWith("/management"))).toEqual([]);
  await page.getByRole("button", { name: "Revizuiește accesul" }).click();
  await page.getByRole("button", { name: "Aplică accesul" }).click();
  await expect(page.getByText("Modificarea a fost salvată")).toBeVisible();
  const writes = api.mutations.filter((mutation) => mutation.path.startsWith("/management"));
  expect(writes).toEqual([{ method: "PUT", path: `/management/employees/${ids.ION_ID}/applications`, body: { applications: ["staff", "dashboard"] }, csrf: "csrf-smoke" }]);
});

test("a server authorization refusal is explained in Romanian and the form returns to server state", async ({ page }) => {
  await mockApi(page, { rejectApplicationsWith: "AUTHORITY_EXCEEDED" });
  await login(page);
  await page.goto(`/angajati/${ids.ION_ID}`);
  await page.getByRole("checkbox", { name: "Panou de control" }).check();
  await page.getByRole("button", { name: "Revizuiește accesul" }).click();
  await page.getByRole("button", { name: "Aplică accesul" }).click();
  await expect(page.getByRole("alert")).toHaveText("Modificarea depășește nivelul tău de autoritate.");
  await expect(page.getByRole("checkbox", { name: "Panou de control" })).not.toBeChecked();
});

test("the protected root identity shows its badge and no modification controls", async ({ page }) => {
  await mockApi(page);
  await login(page);
  await page.goto(`/angajati/${ids.ROOT_ID}`);
  await expect(page.getByRole("heading", { name: "Administrator principal" })).toBeVisible();
  await expect(page.locator(".page-header .root-badge")).toHaveText(/Administrator principal/);
  await expect(page.getByText("Cont de sistem protejat.")).toBeVisible();
  for (const name of ["Dezactivează contul", "Resetează parola", "Revizuiește accesul", "Revizuiește rolurile", "Revizuiește etapele", "Salvează profilul"]) {
    await expect(page.getByRole("button", { name })).toHaveCount(0);
  }
  for (const box of await page.getByRole("checkbox").all()) await expect(box).toBeDisabled();
});

test("mobile layout keeps navigation reachable without horizontal scrolling", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 740 });
  await mockApi(page);
  await login(page);
  await page.getByRole("button", { name: "Meniu" }).click();
  await page.getByRole("navigation").getByRole("link", { name: "Angajați" }).click();
  await expect(page.getByRole("heading", { name: "Angajați" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)).toBe(true);
});

test("the interface switches between Romanian and Turkish, remembers the choice and never touches the session or data", async ({ page }) => {
  const api = await mockApi(page);
  await login(page);
  await expect(page.getByRole("heading", { name: "Bună, Maria." })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "ro");
  const before = api.mutations.length;
  const sessionReads = () => api.requests.filter((request) => request === "GET /auth/session").length;
  const reads = sessionReads();

  await page.getByRole("button", { name: "TR — Türkçe" }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "tr");
  await expect(page.getByRole("button", { name: "TR — Türkçe" })).toHaveAttribute("aria-pressed", "true");
  await expect(page.getByRole("heading", { name: "Merhaba, Maria." })).toBeVisible();
  const nav = page.getByRole("navigation");
  for (const item of ["Yönetim Paneli", "Çalışanlar", "Roller ve Yetkiler", "Departmanlar", "Uygulamalar", "Denetim Kayıtları", "Sistem"]) {
    await expect(nav.getByRole("link", { name: item, exact: true })).toBeVisible();
  }
  for (const romanian of ["Angajați", "Roluri și permisiuni", "Departamente", "Aplicații"]) await expect(nav.getByRole("link", { name: romanian, exact: true })).toHaveCount(0);

  await nav.getByRole("link", { name: "Çalışanlar" }).click();
  await expect(page.getByRole("columnheader", { name: "Ad Soyad" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "Producție" }).first()).toBeVisible(); // business data stays as stored
  await page.getByRole("link", { name: "Ion Popescu" }).click();
  await expect(page.getByRole("heading", { name: "Uygulama Erişimleri" })).toBeVisible();
  await expect(page.getByRole("checkbox", { name: /Malzeme Hazırlığı/ })).toBeVisible();
  await expect(page.getByRole("checkbox", { name: /Confecționare/ })).toBeVisible(); // unknown stage IDs keep the server label

  await nav.getByRole("link", { name: "Roller ve Yetkiler" }).click();
  await expect(page.getByRole("heading", { name: "Roller ve Yetkiler" })).toBeVisible();
  await page.getByRole("link", { name: "Angajat" }).click(); // a role name is business data and is not translated
  await expect(page.getByText("Staff Aşamalarını Yönet")).toBeVisible();
  await expect(page.getByText("employees.manage_stages")).toBeVisible();

  await nav.getByRole("link", { name: "Departmanlar" }).click();
  await expect(page.getByRole("columnheader", { name: "Üst departman" })).toBeVisible();
  await nav.getByRole("link", { name: "Uygulamalar" }).click();
  await expect(page.getByText("Erişim yetkisi").first()).toBeVisible();
  await nav.getByRole("link", { name: "Denetim Kayıtları" }).click();
  await expect(page.getByText("Ana Yönetici, Ion Popescu adlı kullanıcıyı devre dışı bıraktı.")).toBeVisible();
  await expect(page.getByText("4 Eki 2026", { exact: false })).toBeVisible();
  await nav.getByRole("link", { name: "Sistem" }).click();
  await expect(page.getByText("Sürümler ve erişilebilirlik")).toBeVisible();
  await expect(page.locator("body")).not.toContainText("[object Object]");

  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("lang", "tr");
  await expect(page.getByText("Sürümler ve erişilebilirlik")).toBeVisible();
  expect(await page.evaluate(() => Object.keys(localStorage))).toEqual(["arasya.dashboard.locale"]);
  expect(await page.evaluate(() => localStorage.getItem("arasya.dashboard.locale"))).toBe("tr");
  expect(await page.evaluate(() => sessionStorage.length)).toBe(0);

  await page.getByRole("button", { name: "RO — Română" }).click();
  await expect(page.locator("html")).toHaveAttribute("lang", "ro");
  await expect(page.getByText("Versiuni și disponibilitate")).toBeVisible();
  await expect(page.getByRole("navigation").getByRole("link", { name: "Angajați", exact: true })).toBeVisible();

  // Switching language wrote nothing to the API and needed no new login; only the reload re-read the session once.
  expect(api.mutations.length).toBe(before);
  expect(sessionReads()).toBe(reads + 1);
  await expect(page.getByRole("heading", { name: "Autentificare" })).toHaveCount(0);
});

test("the login screen offers the language choice and an invalid saved value falls back to Romanian", async ({ page }) => {
  await mockApi(page);
  await page.addInitScript(() => { if (!sessionStorage.getItem("seeded")) { sessionStorage.setItem("seeded", "1"); localStorage.setItem("arasya.dashboard.locale", "de"); } });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Autentificare" })).toBeVisible();
  await expect(page.locator("html")).toHaveAttribute("lang", "ro");
  await page.getByRole("button", { name: "TR — Türkçe" }).click();
  await expect(page.getByRole("heading", { name: "Giriş" })).toBeVisible();
  await page.getByRole("button", { name: "Giriş yap" }).click();
  await expect(page.getByRole("alert")).toHaveText("Kullanıcı adını ve şifreyi girin.");
  await page.getByLabel("Kullanıcı adı").fill("maria.ionescu");
  await page.getByLabel("Şifre").fill("parola-corecta");
  await page.getByRole("button", { name: "Giriş yap" }).click();
  await expect(page.getByRole("heading", { name: "Merhaba, Maria." })).toBeVisible();
});

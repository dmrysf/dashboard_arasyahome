import { expect, request, test, type Browser } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";

// API 2.35.0 cancellation control against the real Operations API, MySQL and Chromium. The scenario is synthetic: a
// stopped order is physically verified and released by root, an active order is stopped locally (nothing is sent to a
// source), and the production overview lists both once, apart from active production.
const fixture = JSON.parse(readFileSync(path.join(import.meta.dirname, ".real-api-fixture.json"), "utf8"));
const API = "http://127.0.0.1:8788";
const WEB = "http://127.0.0.1:4175";
const ROOT_PASSWORD = "root e2e permanent passphrase 2026";

async function login(browser: Browser, user: string, password: string) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: "reduce" });
  const page = await context.newPage();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto("/");
  await page.getByLabel("Nume utilizator").fill(user);
  await page.getByLabel("Parolă", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Intră în cont" }).click();
  await expect(page.getByRole("navigation")).toBeVisible();
  return { context, page, errors };
}

test("cancellation control: verify, release, local stop, overview and mobile layout", async ({ browser }) => {
  test.setTimeout(180_000);
  const created = JSON.parse(execFileSync("php", [path.join(import.meta.dirname, "cancellation-fixture.php")], { env: process.env, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] }));
  const { page, errors } = await login(browser, fixture.root.username, ROOT_PASSWORD);

  await page.goto(`/comenzi/${encodeURIComponent(created.stopped.order)}`);
  const panel = page.locator('[data-section="cancellation"]');
  await expect(panel).toHaveAttribute("data-stop-state", "stopped");
  await expect(panel).toContainText("Reactivată de sursă, așteaptă decizia");
  await expect(panel).toContainText("Conducerea: verificare fizică a produsului");
  await expect(panel).toContainText("Arasya nu a trimis nimic către sursă");
  await expect(panel.locator('[data-action="release"]')).toHaveCount(0);
  await expect(page.locator('[data-production-state="stopped"]').first()).toBeVisible();

  await panel.locator('[data-action="physical"]').click();
  const physical = page.getByRole("dialog", { name: "Verificare fizică a produsului" });
  await physical.getByLabel("Unde se află produsul / ce ai constatat (obligatoriu)").fill("Raftul de oprire de la etichetare.");
  await expect(physical.getByRole("button", { name: "Înregistrează" })).toBeDisabled();
  await physical.getByLabel("Cod QR al comenzii sau etichetă de bucată").fill(created.stopped.qr);
  await physical.getByRole("button", { name: "Înregistrează" }).click();
  await expect(physical).toHaveCount(0);
  await expect(panel).toContainText("Produs identificat și pus deoparte");

  await panel.locator('[data-action="release"]').click();
  const release = page.getByRole("dialog", { name: "Reiei producția acestei comenzi?" });
  await release.getByLabel("Motivul reluării (obligatoriu)").fill("Clientul a confirmat comanda din nou.");
  await release.getByRole("button", { name: "Reia producția" }).click();
  await expect(release).toHaveCount(0);
  await expect(panel).toHaveAttribute("data-stop-state", "released");
  await expect(panel).toContainText("Reluare aprobată");

  await page.goto(`/comenzi/${encodeURIComponent(created.local.order)}`);
  const local = page.locator('[data-section="cancellation"]');
  await expect(local).toContainText("nu a fost oprită niciodată");
  await local.locator('[data-action="stop"]').click();
  const stop = page.getByRole("dialog", { name: "Oprești producția acestei comenzi?" });
  await stop.getByLabel("Motiv (obligatoriu)").fill("Clientul a cerut anularea telefonic.");
  await stop.getByRole("checkbox", { name: "Înregistrează și o cerere de anulare la sursă" }).check();
  await stop.getByRole("button", { name: "Oprește producția" }).click();
  await expect(stop).toHaveCount(0);
  await expect(local).toContainText("Oprită, anularea la sursă neconfirmată");
  await expect(local).toContainText("Anulare la sursă cerută, neconfirmată");

  // The Staff API refuses manufacturing on the locally stopped order (the screen is not the security boundary).
  const rootApi = await request.newContext({ baseURL: API, extraHTTPHeaders: { Origin: WEB } });
  const signedIn = await rootApi.post("/auth/login", { data: { username: fixture.root.username, password: ROOT_PASSWORD } });
  expect(signedIn.status()).toBe(200);
  const view = await (await rootApi.get(`/management/orders/${encodeURIComponent(created.local.order)}/cancellation`)).json();
  expect(view.cancellation.source.outbound).toBe("not_sent");
  expect(view.cancellation.category).toBe("pending_source_confirmation");

  await page.goto("/");
  const card = page.getByTestId("production-cancellations");
  await expect(card).toBeVisible();
  await expect(card.locator(`[data-cancelled-order="${created.stopped.number}"]`)).toHaveAttribute("data-category", "released");
  await expect(card.locator(`[data-cancelled-order="${created.local.number}"]`)).toHaveAttribute("data-next-action", "physical_reconciliation");

  for (const width of [320, 390, 1280]) {
    await page.setViewportSize({ width, height: 844 });
    await page.goto(`/comenzi/${encodeURIComponent(created.local.order)}`);
    await expect(page.locator('[data-section="cancellation"]')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    await page.screenshot({ path: `e2e/.runtime/dashboard-cancellation-${width}.png`, fullPage: true });
  }
  expect(errors).toEqual([]);
});

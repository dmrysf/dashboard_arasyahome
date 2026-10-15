import { expect, request, test, type Browser } from "@playwright/test";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
const fixture = JSON.parse(readFileSync(path.join(import.meta.dirname, ".real-api-fixture.json"), "utf8"));
const API = "http://127.0.0.1:8788";
const WEB = "http://127.0.0.1:4175";
const ROOT_PASSWORD = "root e2e permanent passphrase 2026";
async function api(user: string, password = fixture.exceptions.password) {
  const context = await request.newContext({ baseURL: API, extraHTTPHeaders: { Origin: WEB } });
  const r = await context.post("/auth/login", { data: { username: user, password } }); expect(r.status()).toBe(200); const csrf = (await r.json()).csrfToken;
  return { context, get: async (url: string) => { const r = await context.get(url); expect(r.status(), await r.text()).toBe(200); return r.json(); }, post: async (url: string, data: unknown) => {
    const r = await context.post(url, { data, headers: { "X-CSRF-Token": csrf, "Idempotency-Key": `roi36-dash-${crypto.randomUUID()}` } }); expect(r.status(), await r.text()).toBeLessThan(300); return r.json();
  } };
}
async function login(browser: Browser, user: string, password = fixture.exceptions.password) {
  const context = await browser.newContext({ viewport: { width: 320, height: 844 }, reducedMotion: "reduce" }); const page = await context.newPage(); const errors: string[] = []; page.on("pageerror", e => errors.push(e.message));
  await page.goto("/"); await page.getByLabel("Nume utilizator").fill(user); await page.getByLabel("Parolă", { exact: true }).fill(password); await page.getByRole("button", { name: "Intră în cont" }).click(); await expect(page.getByRole("navigation")).toBeVisible(); return { context, page, errors };
}

test("Test39/40: physical plan, exact independent approval and committed retry at 320/360/390/1280", async ({ browser }) => {
  test.setTimeout(180_000);
  const created = JSON.parse(execFileSync("php", [path.join(import.meta.dirname, "manifest-fixture.php")], { env: process.env, encoding: "utf8", stdio: ["ignore", "pipe", "inherit"] }));
  const root = await api(fixture.root.username, ROOT_PASSWORD); const rootView = await login(browser, fixture.root.username, ROOT_PASSWORD);
  await rootView.page.goto(`/comenzi/${encodeURIComponent(created.order)}`);
  const panel = rootView.page.getByTestId("manufacturing-plan");
  await expect(panel).toContainText("Număr de bucăți neconfirmat");
  for (const [code, type, count] of [["P-QA", "perdea", "2"], ["D-QA", "draperii", "1"]]) {
    await panel.getByTestId("plan-line").filter({ hasText: code }).getByRole("button", { name: "Verifică și confirmă planul" }).click();
    const dialog = rootView.page.getByRole("dialog", { name: "Confirmă planul fizic" });
    await dialog.getByLabel("Tip verificat").selectOption(type); await dialog.getByLabel("Număr fizic de bucăți").fill(count);
    await dialog.getByLabel("Confirmarea fizică și sursa verificării").fill("Număr fizic verificat în scenariul sintetic; fără împărțire de metraj.");
    await dialog.getByRole("button", { name: "Confirmă planul verificat" }).click(); await expect(dialog).toHaveCount(0);
  }
  const plan = await root.get(`/orders/${encodeURIComponent(created.order)}/manufacturing-plan`); expect(plan.lines.map((l: { commercialQuantity: number; plan: { pieceCount: number } }) => [l.commercialQuantity, l.plan.pieceCount])).toEqual([[1, 2], [1, 1]]);
  expect(plan.lines[0].plan.pieces[0].fabricMeters).toBeNull();
  for (const width of [320, 360, 390, 1280]) { await rootView.page.setViewportSize({ width, height: 844 }); expect(await rootView.page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0); await rootView.page.screenshot({ path: `e2e/.runtime/dashboard-plan-${width}.png`, fullPage: true }); }
  const chiefId = (await root.get(`/management/employees?search=${fixture.supervision.chief}`)).items.find((e: { username: string }) => e.username === fixture.supervision.chief).id;
  const appointed = await root.post("/management/organization/responsibilities", { responsibility: "tailoring_quality_supervisor", employeeId: chiefId }); const assignment = appointed.responsibilities.find((r: { state: string; responsibility: string }) => r.state === "active" && r.responsibility === "tailoring_quality_supervisor").id;
  const cutter = await api(fixture.exceptions.cutter); const tailor = await api(fixture.supervision.tailor); const chief = await api(fixture.supervision.chief);
  const orderPath = `/orders/${encodeURIComponent(created.order)}`; let state = await cutter.get(orderPath); const pool = await cutter.get("/cutting/pool");
  state = await cutter.post(`${orderPath}/claim`, { expectedVersion: state.productionVersion, qrToken: created.qr, ownedCount: pool.ownedCount, confirmedMultiple: pool.ownedCount > 0 }); state = await cutter.post(`${orderPath}/transition`, { expectedVersion: state.productionVersion });
  for (let i = 0; i < 3; i++) { state = await tailor.post(`${orderPath}/claim`, { expectedVersion: state.productionVersion }); state = await tailor.post(`${orderPath}/transition`, { expectedVersion: state.productionVersion }); }
  const route = state.pieces.tracks[0]; await tailor.post(`/production-tracks/${route.id}/claim`, { expectedVersion: route.version, qrToken: created.qr }); state = await tailor.get(orderPath);
  const track = state.pieces.tracks.find((t: { id: string }) => t.id === route.id); const defective = state.pieces.units.find((u: { trackId: string }) => u.trackId === track.id);
  let fault = await tailor.post(`${orderPath}/fault-reports`, { expectedVersion: track.version, trackId: track.id, units: [defective.id], reasonKey: "cut-meterage", comment: "O singură bucată defectă în scenariul izolat." });
  fault = await chief.post(`/production-exceptions/${fault.id}/review`, { expectedVersion: fault.version, decision: "accept", reasonKey: "cut-meterage", qrToken: created.qr }); fault = await chief.post(`/production-exceptions/${fault.id}/return`, { expectedVersion: fault.version });
  fault = await cutter.post(`/production-exceptions/${fault.id}/acknowledge`, { expectedVersion: fault.version, confirmed: true, qrToken: created.qr, responsibility: "disputed", comment: "Primire fizică; responsabilitate contestată." });
  const manager = await login(browser, fixture.exceptions.managers[0].username); await manager.page.goto("/aprobari"); await manager.page.getByRole("button", { name: new RegExp(`Comanda ${created.number}`) }).click();
  await expect(manager.page.getByTestId("affected-pieces")).toContainText("Bucata 1/2"); await expect(manager.page.getByTestId("approval-scope-notice")).toContainText("1");
  await manager.page.getByRole("button", { name: "Aprobă returnarea la tăiere", exact: true }).click(); const dialog = manager.page.getByRole("dialog");
  await expect(dialog.getByTestId("confirm-affected-pieces")).toContainText("Bucata 1/2"); await expect(dialog.getByRole("button", { name: "Aprobă returnarea la tăiere", exact: true })).toBeDisabled();
  await dialog.getByRole("checkbox", { name: /Am verificat liniile/ }).check(); await dialog.getByRole("radio", { name: /Fără vină/ }).check();
  for (const width of [320, 360, 390, 1280]) { await manager.page.setViewportSize({ width, height: 844 }); expect(await manager.page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0); await manager.page.screenshot({ path: `e2e/.runtime/dashboard-exact-approval-${width}.png`, fullPage: true }); }
  const requests: { key: string | undefined; body: string | null }[] = [];
  await manager.page.route("**/management/production-exceptions/*/decision", async route => { requests.push({ key: route.request().headers()["idempotency-key"], body: route.request().postData() }); await route.fetch(); await route.abort("failed"); });
  await dialog.getByRole("button", { name: "Aprobă returnarea la tăiere", exact: true }).click(); await expect(dialog.getByRole("alert")).toBeVisible();
  await expect(dialog.getByRole("checkbox", { name: /Am verificat liniile/ })).toBeDisabled(); await manager.page.unroute("**/management/production-exceptions/*/decision");
  manager.page.on("request", r => { if (r.url().endsWith(`/production-exceptions/${fault.id}/decision`)) requests.push({ key: r.headers()["idempotency-key"], body: r.postData() }); });
  await dialog.getByRole("button", { name: "Aprobă returnarea la tăiere", exact: true }).click(); await expect(dialog).toHaveCount(0); expect(requests).toHaveLength(2); expect(requests[1]).toEqual(requests[0]);
  const committed = await chief.get(`/production-exceptions/${fault.id}`); expect(committed.status).toBe("approved"); expect(committed.decisions.filter((d: { status: string }) => d.status === "approved")).toHaveLength(1);
  state = await tailor.get(orderPath); expect(state.productionStageId).toBe("bottom-hem"); const rework = state.pieces.tracks.find((t: { kind: string }) => t.kind === "rework"); expect(rework.quantity).toBe(1); expect(rework.stage.id).toBe("material-preparation");
  expect(manager.errors).toEqual([]); expect(rootView.errors).toEqual([]);
  await root.post(`/management/organization/responsibilities/${assignment}/revoke`, { reason: "Scenariu izolat încheiat" });
  await Promise.all([manager.context.close(), rootView.context.close(), root.context.dispose(), chief.context.dispose(), cutter.context.dispose(), tailor.context.dispose()]);
});

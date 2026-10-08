# Arasya Dashboard

Dashboard **0.11.0** makes the first login unmistakable and safer to use: the forced change is titled *Setează parola personală* and states that a personal password is required before any company information; every password field (login, current, new, confirmation) has its own Show/Hide control with a distinct accessible name and `aria-pressed`; Romanian (and Turkish) checks run before the request (all fields, 12 characters, different from the current password, no username, matching confirmation) while the API stays the authority. A voluntary *Schimbă parola* in the account area keeps one central password for every application. Works with Operations API 2.22 and later; API 2.23 adds the rate limit on password changes. See the API repository's `docs/employee-onboarding.md`.

Dashboard **0.10.0** / Operations API **2.22.0** adds the root-only *Surse pentru documente* card on the employee page: which order sources (Trendhome, OutletPerdele, Trendyol, B2B) an identity's production document permissions reach, separately for operating and approving. A document permission without a scope reaches nothing; a scope grants no permission by itself. Every other viewer, the CEO included, sees the scopes read-only, and the API refuses their changes with `ROOT_ONLY`. Changes go through the usual review dialog and are audited (`employee.document_scopes_changed`). Against an API older than 2.22 the card is hidden. See the API repository's `docs/organization-iam.md`.

Dashboard **0.9.1** labels the two production-authority timeline actions of Operations API **2.18.0** (`authority_taken_over`, `authority_released`) in Romanian and Turkish instead of the generic fallback. Label-only; nothing else changes, and it deploys independently of any authority activation.

Dashboard **0.9.0** / Operations API **2.16.0** adds Production Documents V1: the central queue of production document / QR revision requests (*Revizii documente*, *Istoricul aprobărilor*) for the primary revision approver and the CEO-appointed temporary backup, a human-readable production diff, live first-decision-wins, the read-only document history of an order (*Documente de producție*), the root-only emergency revoke and the new scoped backup responsibility on the organisation page. Operations managers keep their narrow approval pool and never see document revisions. See the API repository's `docs/production-documents.md`.

Dashboard **0.8.0** / Operations API **2.15.0** adds Management Analytics V1: employee/department facts, approval response metrics, source/company distributions and canonical lifecycle drilldown. It uses additive migration **016**, an explicitly assigned central IAM `analytics-reader` permission and separate Dashboard application access. Root and the canonical CEO may read; operations-manager stays narrow and is server-denied even with an accidental analytics grant. Only Root can edit approval grace. Reports are RO/TR, responsive and deliberately refreshed; no scores, financial leakage or production deployment. See the API repository's `docs/management-analytics.md` for formulas, rebuild and manual rollout.

Dashboard **0.7.0**, with Operations API **2.14.0** and migration **015**, adds cutting transfers to the existing narrow operations approval center and a Root-only display-device administration page. Approval never changes ownership; target acceptance plus the same canonical QR does. No broad IAM grants or production deployment are part of this milestone. See the API repository's `docs/cutting-pool.md` for rollout and recovery.

Central management console (`https://dashboard.arasyahome.ro`) for the Arasya identity and access system. The Dashboard has no users table and no permission copy: `https://api.arasyahome.ro` (Operations API 2.5+) is the only identity provider, and every screen reflects the authorization the API returns.

- React 19 + Vite 8 + TypeScript. Interface in Romanian (default and fallback) and Turkish, chosen with the RO | TR switch.
- Session: HttpOnly API cookie (`credentials: "include"`), CSRF token kept in memory only. The only browser-storage entry is the interface language (`arasya.dashboard.locale`); no session, token, password or permission is ever stored.
- Gate: pending password change first, then `dashboard` application access (`Nu ai acces la Panoul de control.` otherwise).
- Screens: Panou de control, Comenzi, Angajați, Roluri și permisiuni, Departamente, Aplicații, Audit, Sistem.
- Authorization changes are reviewed in a confirmation dialog before anything is written. The protected root identity (`arasya.root.owner`) is read-only in the UI; the API enforces this independently (`ROOT_PROTECTED`).

## Production approvals (0.6.0)

Operations API 2.13.0 / additive migration 014 ([design](https://github.com/dmrysf/staff_arasyahome/blob/main/docs/production-exceptions.md)). Operations managers ("Manager operațional", one shared role) see only Aprobări, În așteptare, Aprobările mele and Caută comandă (exact number, no list). One decision approves or rejects a cutting fault return; the other manager's screen closes live. A temporary backup approver appointed by the CEO decides through the same screens. Root and the CEO principal manage Organizație (CEO, Responsabil Primire Croitorie, backup approver, working hours); root alone manages Setări producție (approval mode, fault reasons, stage display labels). Live updates use the authenticated `/live/events` stream; no page refresh is needed.

## B2B project permissions (0.5.5)

Operations API 2.12.0 / additive migration 013 registers `b2b.projects.view`, `.create`, `.update`, `.archive` and `.convert` for the Visual Project Builder core. Dashboard labels and descriptions are complete in RO/TR; `convert` states that Classic order creation is also required. No role receives these automatically. No IAM architecture change.

## B2B production permissions (0.5.4)

Operations API 2.11.0 / additive migration 012 registers `b2b.production.view` and `b2b.production.submit`. Dashboard labels and descriptions are complete in RO/TR and clearly distinguish reading progress/submitting a finalized order from operating production. No role receives these automatically; B2B application access remains a separate assignment. The shared production timeline also translates the `production_submitted` event. No IAM architecture or source-integration change.

## B2B current account permissions (0.5.3)

Romanian and Turkish labels for the five current account permissions of Operations API 2.10.0 / migration 011: view, record payment (and allocate), adjust (opening balances and adjustments), reverse, and export statements. They are granted explicitly through the existing role editor; migration 011 grants no role. The Dashboard shows no account data.

## B2B order permissions (0.5.2)

Romanian and Turkish labels describe exactly four fixed order permissions: view, create/duplicate, edit drafts, and manage commercial status (finalize/cancel). Finalization does not send orders into Staff production. Permissions are still granted explicitly through the existing role editor; Operations API 2.9.0 / migration 010 grants no roles automatically.

## B2B localization (0.5.1)

A small compatibility patch for B2B Companies V1 (Operations API 2.8.0). The `b2b` application is described as what it is: **Aplicația internă pentru vânzări en-gros și clienți B2B** / **Toptan satış ve B2B müşteri yönetimi uygulaması**, no longer as a partner portal. `b2b.access` and the four company permissions (`b2b.companies.view`, `.create`, `.update`, `.manage_status`) have Romanian and Turkish labels and descriptions. The role editor shows them in their own `b2b` group, so a Turkish screen never shows the server's Romanian label. Roles that use them are composed here as usual. B2B has no permission screen of its own. No other screen changed.

## Production Control V2: supervisor owner interventions (0.5.0)

The order detail gains a **Control producție / Üretim Kontrolü** section (Operations API 2.6.0). It shows the current stage, owner, claim time, production version and state, and whether an owner intervention is possible.

- Holders of `production.manage_owner` get exactly two actions: **Schimbă responsabilul / Sorumluyu Değiştir** (or **Atribuie responsabil** when nobody owns the order) and **Eliberează responsabilul / Sorumluluğu Serbest Bırak**. Without the permission the section explains why; the API enforces it regardless.
- Reassignment picks from the server's list of eligible employees (active, Staff access, permission for the current stage, within the viewer's authority) and shows current owner, new owner and current stage with the warning that the stage and the store status do not change. Release asks for an explicit confirmation.
- Each submission sends the production version the supervisor saw and a fresh `Idempotency-Key`. If Staff changed the order first, the API answers `ORDER_CHANGED`; the page reloads and says so instead of overwriting.
- The timeline shows interventions (who, `A → B`, release). The order list adds a neutral attention state (no owner, owner inactive, owner without Staff access or without the current stage), a filter for orders whose owner can no longer work, and counters for unassigned active orders. There is no SLA, so nothing is called late.
- The employee page shows a **Pilot readiness** card built from booleans the API already returns (`staff_arasyahome/docs/pilot-readiness.md`).
- Still no stage control of any kind: no stage selector, jump, reset or reopen. Owner interventions do not change the Arasya production stage or the Trendhome WooCommerce order status.

## Production Control: Comenzi (0.4.0)

`/comenzi` is an order workspace on `GET /management/orders` and `GET /management/orders/{globalOrderId}` (Operations API 2.5.0, `orders.view_all`; the timeline also needs `activity.view_all`).

- Two independent states, shown with different shapes and headings: **Status magazin / Mağaza Durumu** (the source's commerce status, received inbound only) and **Etapă producție / Üretim Aşaması** (the Arasya curtain-production@1 stage). The Dashboard never derives one from the other.
- Server-side filters (search by order number or global id, source, stage, store status, owner, assigned/unassigned, active/completed/cancelled) and cursor pages of 25/50/100.
- Detail at `/comenzi/<source>:<id>` (the global id, never the bare order number): store section, production section with owner, stage entry and time in stage (same definition as the overview, no SLA wording), normalized items and measurements, production notes and the immutable production timeline.
- List and detail refresh every 45 seconds while visible (shared poller), with manual refresh; a failed refresh keeps the last data.
- No stage action exists here: no stage selector, no claim, no override. Staff remains where stages change (0.5.0 adds only the owner interventions above). Arasya production transitions do not mutate WooCommerce order statuses (see `staff_arasyahome/docs/production-control.md`).

## Production overview (0.3.0)

The home page (`/`) opens with a read-only production snapshot from `GET /management/production-overview` (Operations API 2.4.0). All numbers are aggregated by the API; the Dashboard holds no production constants and never aggregates order history in the browser.

- Summary: active orders, waiting, in work, unassigned and completed today (Europe/Bucharest day). Definitions are documented with the API in `staff_arasyahome/docs/production-overview.md`.
- The 14 `curtain-production@1` stages in order with counts, unassigned counts and the age of the oldest order; the busiest stage is marked, without alarm colours.
- Oldest active orders sorted by time in the current stage (no SLA exists, so nothing is labelled late), recent production activity (separate from the IAM audit) and source health (`healthy`, `stale`, `offline`, `no_contact`, `not_configured`, `disabled`).
- Requires `production.view`; order rows, activity and sources additionally need `orders.view_all`, `activity.view_all` and `sources.view` and show a permission note otherwise.
- Refreshes every 45 seconds while the tab is visible, never overlaps requests, aborts stale ones, keeps the last good data if a refresh fails, and offers a manual **Actualizează / Yenile**. An optional source filter is the only filter. There are no production actions on this page.

## Localization

All interface text lives in `src/i18n/ro.ts` (the reference shape) and `src/i18n/tr.ts`, which must match it key for key or the build fails. Components read text through `useI18n()`; failures and notices are kept as codes and rendered in the active language, so an open message follows a language switch.

- The browser or OS language is never used; Romanian applies until an administrator picks another language.
- Stable server identifiers (permission keys, the 14 stage IDs, application keys, audit actions) are lookup keys only. Known system catalog entries get a localized label; unknown keys keep the server's own text.
- Business data (employee, role and department names, audit snapshots) is shown exactly as the API returns it.
- Dates and numbers use `Intl` with `ro-RO` or `tr-TR`; `<html lang>` follows the active language.

## Development

```bash
pnpm install --frozen-lockfile
VITE_DASHBOARD_API_BASE_URL=https://api.arasyahome.ro pnpm build
pnpm typecheck && pnpm lint && pnpm test
pnpm test:e2e:smoke          # Chromium against the production build with an in-memory API double
pnpm test:e2e:real           # Chromium against the real Operations API (see below)
VITE_DASHBOARD_API_BASE_URL=https://api.arasyahome.ro pnpm verify
```

The real-API suite needs `./operations-api` from `dmrysf/staff_arasyahome` at the commit in `e2e/operations-api.ref` (locally a symlink to a checkout, in CI a read-only deploy-key checkout) and a disposable database whose name contains `e2e` and `test`:

```bash
ARASYA_E2E_DB_NAME=arasya_dashboard_e2e_test ARASYA_TEST_DB_USER=... ARASYA_TEST_DB_PASSWORD=... pnpm test:e2e:real
```

See [docs/production-rollout.md](docs/production-rollout.md) for CI, releases, deployment and rollback.

# Arasya Dashboard

Central management console (`https://dashboard.arasyahome.ro`) for the Arasya identity and access system. The Dashboard has no users table and no permission copy: `https://api.arasyahome.ro` (Operations API 2.3+) is the only identity provider, and every screen reflects the authorization the API returns.

- React 19 + Vite 8 + TypeScript. Interface in Romanian (default and fallback) and Turkish, chosen with the RO | TR switch.
- Session: HttpOnly API cookie (`credentials: "include"`), CSRF token kept in memory only. The only browser-storage entry is the interface language (`arasya.dashboard.locale`); no session, token, password or permission is ever stored.
- Gate: pending password change first, then `dashboard` application access (`Nu ai acces la Panoul de control.` otherwise).
- Screens: Panou de control, Angajați, Roluri și permisiuni, Departamente, Aplicații, Audit, Sistem.
- Authorization changes are reviewed in a confirmation dialog before anything is written. The protected root identity (`arasya.root.owner`) is read-only in the UI; the API enforces this independently (`ROOT_PROTECTED`).

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

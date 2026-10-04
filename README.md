# Arasya Dashboard

Central management console (`https://dashboard.arasyahome.ro`) for the Arasya identity and access system. The Dashboard has no users table and no permission copy: `https://api.arasyahome.ro` (Operations API 2.3+) is the only identity provider, and every screen reflects the authorization the API returns.

- React 19 + Vite 8 + TypeScript, Romanian UI.
- Session: HttpOnly API cookie (`credentials: "include"`), CSRF token kept in memory only, nothing in browser storage.
- Gate: pending password change first, then `dashboard` application access (`Nu ai acces la Panoul de control.` otherwise).
- Screens: Panou de control, Angajați, Roluri și permisiuni, Departamente, Aplicații, Audit, Sistem.
- Authorization changes are reviewed in a confirmation dialog before anything is written. The protected root identity (`arasya.root.owner`) is read-only in the UI; the API enforces this independently (`ROOT_PROTECTED`).

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

import { useState, type ReactNode } from "react";
import { useDashboard } from "../app/context";
import type { Messages } from "../i18n";
import { useI18n } from "../i18n/context";
import { LocaleSwitcher, RootBadge } from "./ui";

const NAVIGATION: Array<{ path: string; label: keyof Messages["nav"]; permission: string; match: (path: string) => boolean }> = [
  { path: "/", label: "overview", permission: "dashboard.overview.view", match: (path) => path === "/" },
  { path: "/comenzi", label: "orders", permission: "orders.view_all", match: (path) => path.startsWith("/comenzi") },
  { path: "/angajati", label: "employees", permission: "employees.view", match: (path) => path.startsWith("/angajati") },
  { path: "/roluri", label: "roles", permission: "roles.view", match: (path) => path.startsWith("/roluri") },
  { path: "/departamente", label: "departments", permission: "departments.view", match: (path) => path.startsWith("/departamente") },
  { path: "/aplicatii", label: "applications", permission: "applications.view", match: (path) => path.startsWith("/aplicatii") },
  { path: "/audit", label: "audit", permission: "iam.audit.view", match: (path) => path.startsWith("/audit") },
  { path: "/sistem", label: "system", permission: "system.view", match: (path) => path.startsWith("/sistem") },
];

export function Shell({ pathname, onLogout, children }: { pathname: string; onLogout: () => void; children: ReactNode }) {
  const { me, can, navigate } = useDashboard();
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const items = NAVIGATION.filter((item) => can(item.permission));
  return (
    <div className={`shell ${open ? "nav-open" : ""}`}>
      <aside className="sidebar">
        <div className="sidebar-brand"><span className="brand-mark">A</span><div><strong>Arasya</strong><span>{t.brand.product}</span></div></div>
        <nav aria-label={t.shell.navigation}>
          {items.map((item) => (
            <a key={item.path} href={item.path} className={item.match(pathname) ? "active" : ""} aria-current={item.match(pathname) ? "page" : undefined}
              onClick={(event) => { event.preventDefault(); setOpen(false); navigate(item.path); }}>{t.nav[item.label]}</a>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="identity">
            <strong>{me.employee.displayName}</strong>
            <span>{me.employee.username}</span>
            {me.isRoot && <RootBadge />}
          </div>
          <button type="button" className="button button-ghost button-block" onClick={onLogout}>{t.common.logout}</button>
        </div>
      </aside>
      <div className="main-column">
        <div className="topbar">
          <button type="button" className="menu-toggle" aria-label={t.shell.menu} aria-expanded={open} onClick={() => setOpen((value) => !value)}><span /><span /><span /></button>
          <strong className="topbar-title">{t.brand.title}</strong>
          <LocaleSwitcher />
        </div>
        <main className="content">{children}</main>
      </div>
    </div>
  );
}

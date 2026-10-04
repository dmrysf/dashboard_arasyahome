import { useState, type ReactNode } from "react";
import { useDashboard } from "../app/context";
import { RootBadge } from "./ui";

const NAVIGATION: Array<{ path: string; label: string; permission: string; match: (path: string) => boolean }> = [
  { path: "/", label: "Panou de control", permission: "dashboard.overview.view", match: (path) => path === "/" },
  { path: "/angajati", label: "Angajați", permission: "employees.view", match: (path) => path.startsWith("/angajati") },
  { path: "/roluri", label: "Roluri și permisiuni", permission: "roles.view", match: (path) => path.startsWith("/roluri") },
  { path: "/departamente", label: "Departamente", permission: "departments.view", match: (path) => path.startsWith("/departamente") },
  { path: "/aplicatii", label: "Aplicații", permission: "applications.view", match: (path) => path.startsWith("/aplicatii") },
  { path: "/audit", label: "Audit", permission: "iam.audit.view", match: (path) => path.startsWith("/audit") },
  { path: "/sistem", label: "Sistem", permission: "system.view", match: (path) => path.startsWith("/sistem") },
];

export function Shell({ pathname, onLogout, children }: { pathname: string; onLogout: () => void; children: ReactNode }) {
  const { me, can, navigate } = useDashboard();
  const [open, setOpen] = useState(false);
  const items = NAVIGATION.filter((item) => can(item.permission));
  return (
    <div className={`shell ${open ? "nav-open" : ""}`}>
      <aside className="sidebar">
        <div className="sidebar-brand"><span className="brand-mark">A</span><div><strong>Arasya</strong><span>Panou de control</span></div></div>
        <nav aria-label="Navigare principală">
          {items.map((item) => (
            <a key={item.path} href={item.path} className={item.match(pathname) ? "active" : ""} aria-current={item.match(pathname) ? "page" : undefined}
              onClick={(event) => { event.preventDefault(); setOpen(false); navigate(item.path); }}>{item.label}</a>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="identity">
            <strong>{me.employee.displayName}</strong>
            <span>{me.employee.username}</span>
            {me.isRoot && <RootBadge />}
          </div>
          <button type="button" className="button button-ghost button-block" onClick={onLogout}>Ieși din cont</button>
        </div>
      </aside>
      <div className="main-column">
        <div className="topbar">
          <button type="button" className="menu-toggle" aria-label="Meniu" aria-expanded={open} onClick={() => setOpen((value) => !value)}><span /><span /><span /></button>
          <strong>Arasya · Panou de control</strong>
        </div>
        <main className="content">{children}</main>
      </div>
    </div>
  );
}

import { useEffect, useState, type ReactNode } from "react";
import type { ManagementMe } from "../api/types";
import { useDashboard } from "../app/context";
import { useLive } from "../app/liveContext";
import type { Messages } from "../i18n";
import { useI18n } from "../i18n/context";
import { LocaleSwitcher, RootBadge } from "./ui";

type NavItem = { path: string; label: keyof Messages["nav"]; visible: (me: ManagementMe, can: (permission: string) => boolean) => boolean; match: (path: string) => boolean };

/** Company-wide overview only for identities that may see organisation or production data. */
export const canSeeOverview = (me: ManagementMe, can: (permission: string) => boolean) =>
  can("dashboard.overview.view") && (me.isRoot || can("employees.view") || can("production.view") || can("orders.view_all"));

export const NAVIGATION: NavItem[] = [
  { path: "/analiza/angajati", label: "analytics", visible: (me) => Boolean(me.capabilities?.viewAnalytics), match: path => path.startsWith("/analiza") },
  { path: "/", label: "overview", visible: canSeeOverview, match: (path) => path === "/" },
  { path: "/aprobari", label: "approvals", visible: (me) => Boolean(me.capabilities?.approveExceptions), match: (path) => path === "/aprobari" || path.startsWith("/aprobari/cerere/") || path.startsWith("/aprobari/transfer/") },
  { path: "/aprobari/in-asteptare", label: "waiting", visible: (me) => Boolean(me.capabilities?.approveExceptions), match: (path) => path === "/aprobari/in-asteptare" },
  { path: "/aprobari/istoric", label: "myApprovals", visible: (me) => Boolean(me.capabilities?.approveExceptions), match: (path) => path === "/aprobari/istoric" },
  { path: "/revizii-documente", label: "documentRevisions", visible: (me) => Boolean(me.capabilities?.approveDocumentRevisions), match: (path) => path === "/revizii-documente" || path.startsWith("/revizii-documente/cerere/") },
  { path: "/revizii-documente/istoric", label: "documentHistory", visible: (me) => Boolean(me.capabilities?.approveDocumentRevisions), match: (path) => path === "/revizii-documente/istoric" },
  { path: "/documente", label: "documents", visible: (me) => Boolean(me.capabilities?.viewDocumentHistory), match: (path) => path.startsWith("/documente") },
  { path: "/cauta-comanda", label: "orderSearch", visible: (me) => Boolean(me.capabilities?.lookupOrders), match: (path) => path.startsWith("/cauta-comanda") },
  { path: "/comenzi", label: "orders", visible: (_, can) => can("orders.view_all"), match: (path) => path.startsWith("/comenzi") },
  { path: "/angajati", label: "employees", visible: (_, can) => can("employees.view"), match: (path) => path.startsWith("/angajati") },
  { path: "/roluri", label: "roles", visible: (_, can) => can("roles.view"), match: (path) => path.startsWith("/roluri") },
  { path: "/departamente", label: "departments", visible: (_, can) => can("departments.view"), match: (path) => path.startsWith("/departamente") },
  { path: "/aplicatii", label: "applications", visible: (_, can) => can("applications.view"), match: (path) => path.startsWith("/aplicatii") },
  { path: "/organizatie", label: "organization", visible: (me) => Boolean(me.capabilities?.manageOrganization), match: (path) => path.startsWith("/organizatie") },
  { path: "/setari-productie", label: "productionSettings", visible: (me) => Boolean(me.capabilities?.manageProductionSettings), match: (path) => path.startsWith("/setari-productie") },
  { path: "/dispozitive-afisare", label: "displayDevices", visible: (me) => me.isRoot, match: path => path === "/dispozitive-afisare" },
  { path: "/audit", label: "audit", visible: (_, can) => can("iam.audit.view"), match: (path) => path.startsWith("/audit") },
  { path: "/sistem", label: "system", visible: (_, can) => can("system.view"), match: (path) => path.startsWith("/sistem") },
];

/** Live count of document revision requests waiting for the revision approver. */
function useRevisionCount(enabled: boolean): number | null {
  const { api } = useDashboard();
  const { revision } = useLive();
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    if (!enabled) return undefined;
    const controller = new AbortController();
    api.documentRequests("pending", controller.signal).then((page) => { if (!controller.signal.aborted) setCount(page.pendingCount); }, () => undefined);
    return () => controller.abort();
  }, [api, enabled, revision]);
  return enabled ? count : null;
}

/** Live count of requests waiting for a manager decision, re-read on every live event. */
function usePendingCount(enabled: boolean): number | null {
  const { api } = useDashboard();
  const { revision } = useLive();
  const [count, setCount] = useState<number | null>(null);
  useEffect(() => {
    if (!enabled) return undefined;
    const controller = new AbortController();
    Promise.all([api.exceptions("pending", controller.signal), api.cuttingTransfers("pending", controller.signal)]).then(([page, transfers]) => { if (!controller.signal.aborted) setCount(page.items.length + transfers.items.length); }, () => undefined);
    return () => controller.abort();
  }, [api, enabled, revision]);
  return enabled ? count : null;
}

function LiveNotices() {
  const { navigate } = useDashboard();
  const { t } = useI18n();
  const { last, connection } = useLive();
  const [dismissed, setDismissed] = useState(0);
  const visible = last !== null && ["exception.approval_pending", "cutting.transfer.pending", "document.revision_requested"].includes(last.type) && last.seq > dismissed;
  return <>
    {connection === "reconnecting" && <p className="live-connection" role="status">{t.exceptions.reconnecting}</p>}
    {visible && <div className="live-notice" role="status" aria-live="assertive">
      <span>{last.type === "document.revision_requested" ? t.documents.newRequest(last.orderNumber ?? "", last.revisionNumber ?? 0) : t.exceptions.newRequest(last.orderNumber ?? "")}</span>
      {last.type === "document.revision_requested" && last.requestId && <button type="button" className="button button-primary" onClick={() => { setDismissed(last.seq); navigate(`/revizii-documente/cerere/${last.requestId}`); }}>{t.documents.open}</button>}
      {last.exceptionId && <button type="button" className="button button-primary" onClick={() => { setDismissed(last.seq); navigate(`/aprobari/cerere/${last.exceptionId}`); }}>{t.exceptions.open}</button>}
      {last.transferId && <button type="button" className="button button-primary" onClick={() => { setDismissed(last.seq); navigate(`/aprobari/transfer/${last.transferId}`); }}>Deschide transferul</button>}
      <button type="button" className="button button-ghost" onClick={() => setDismissed(last.seq)}>{t.common.cancel}</button>
    </div>}
  </>;
}

export function Shell({ pathname, onLogout, onChangePassword, passwordChanged = false, children }: { pathname: string; onLogout: () => void; onChangePassword?: () => void; passwordChanged?: boolean; children: ReactNode }) {
  const { me, can, navigate } = useDashboard();
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const items = NAVIGATION.filter((item) => item.visible(me, can));
  const pending = usePendingCount(Boolean(me.capabilities?.approveExceptions));
  const revisions = useRevisionCount(Boolean(me.capabilities?.approveDocumentRevisions));
  return (
    <div className={`shell ${open ? "nav-open" : ""}`}>
      <aside className="sidebar">
        <div className="sidebar-brand"><span className="brand-mark">A</span><div><strong>Arasya</strong><span>{t.brand.product}</span></div></div>
        <nav aria-label={t.shell.navigation}>
          {items.map((item) => (
            <a key={item.path} href={item.path} className={item.match(pathname) ? "active" : ""} aria-current={item.match(pathname) ? "page" : undefined}
              onClick={(event) => { event.preventDefault(); setOpen(false); navigate(item.path); }}>{t.nav[item.label]}
              {item.label === "approvals" && pending !== null && pending > 0 && <span className="nav-count" aria-label={t.exceptions.pendingCount(pending)}>{pending}</span>}
              {item.label === "documentRevisions" && revisions !== null && revisions > 0 && <span className="nav-count" aria-label={t.documents.pendingCount(revisions)}>{revisions}</span>}</a>
          ))}
        </nav>
        <div className="sidebar-footer">
          <div className="identity">
            <strong>{me.employee.displayName}</strong>
            <span>{me.employee.positionTitle ?? me.employee.username}</span>
            {me.isRoot && <RootBadge />}
          </div>
          {passwordChanged && <p className="password-changed" role="status">{t.auth.passwordChanged}</p>}
          {onChangePassword && <button type="button" className="button button-ghost button-block" onClick={onChangePassword}>{t.auth.changePassword}</button>}
          <button type="button" className="button button-ghost button-block" onClick={onLogout}>{t.common.logout}</button>
        </div>
      </aside>
      <div className="main-column">
        <div className="topbar">
          <button type="button" className="menu-toggle" aria-label={t.shell.menu} aria-expanded={open} onClick={() => setOpen((value) => !value)}><span /><span /><span /></button>
          <strong className="topbar-title">{t.brand.title}</strong>
          {pending !== null && pending > 0 && <button type="button" className="topbar-count" onClick={() => navigate("/aprobari")}>{t.exceptions.pendingCount(pending)}</button>}
          <LocaleSwitcher />
        </div>
        <main className="content">{children}</main>
      </div>
      <LiveNotices />
    </div>
  );
}

import { useEffect, useId, useRef, useState, type ReactNode } from "react";

export function Badge({ tone = "neutral", children }: { tone?: "neutral" | "success" | "warning" | "danger" | "accent" | "root"; children: ReactNode }) {
  return <span className={`badge badge-${tone}`}>{children}</span>;
}

export function StatusBadge({ status }: { status: string }) {
  const tone = status === "active" ? "success" : status === "inactive" ? "neutral" : "warning";
  return <Badge tone={tone}>{status === "active" ? "Activ" : status === "inactive" ? "Inactiv" : "Suspendat"}</Badge>;
}

export function RootBadge() {
  return <span className="root-badge" title="Cont de sistem protejat"><LockIcon /> Administrator principal</span>;
}

export function LockIcon() {
  return <svg aria-hidden="true" viewBox="0 0 16 16" width="12" height="12"><path d="M4.5 7V5a3.5 3.5 0 0 1 7 0v2h.5A1 1 0 0 1 13 8v6a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V8a1 1 0 0 1 1-1zm1.5 0h4V5a2 2 0 0 0-4 0z" fill="currentColor" /></svg>;
}

export function PageHeader({ title, description, actions }: { title: string; description?: string; actions?: ReactNode }) {
  return (
    <header className="page-header">
      <div><h1>{title}</h1>{description && <p>{description}</p>}</div>
      {actions && <div className="page-actions">{actions}</div>}
    </header>
  );
}

export function Card({ title, description, actions, children, className = "" }: { title?: string; description?: string; actions?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <section className={`card ${className}`}>
      {(title || actions) && <div className="card-header"><div>{title && <h2>{title}</h2>}{description && <p>{description}</p>}</div>{actions}</div>}
      {children}
    </section>
  );
}

export function ErrorBanner({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return <div className="error-banner" role="alert"><span>{message}</span>{onRetry && <button type="button" className="button button-ghost" onClick={onRetry}>Reîncearcă</button>}</div>;
}

export function Notice({ children, tone = "info" }: { children: ReactNode; tone?: "info" | "success" | "warning" }) {
  return <div className={`notice notice-${tone}`} role="status">{children}</div>;
}

export function Loading({ label = "Se încarcă…" }: { label?: string }) {
  return <div className="loading" aria-live="polite"><span className="spinner" />{label}</div>;
}

export function EmptyState({ title, children }: { title: string; children?: ReactNode }) {
  return <div className="empty-state"><h3>{title}</h3>{children && <p>{children}</p>}</div>;
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: (id: string) => ReactNode }) {
  const id = useId();
  return <div className="field"><label htmlFor={id}>{label}</label>{children(id)}{hint && <small>{hint}</small>}</div>;
}

/** Review-then-confirm dialog for high-impact changes. */
export function ConfirmDialog({ title, children, confirmLabel, tone = "primary", busy, onConfirm, onCancel }: {
  title: string; children: ReactNode; confirmLabel: string; tone?: "primary" | "danger"; busy?: boolean; onConfirm: () => void; onCancel: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => { if (dialog?.open) dialog.close(); };
  }, []);
  return (
    <dialog ref={ref} className="dialog" aria-labelledby="confirm-title" onCancel={(event) => { event.preventDefault(); if (!busy) onCancel(); }}>
      <h2 id="confirm-title">{title}</h2>
      <div className="dialog-body">{children}</div>
      <div className="dialog-actions">
        <button type="button" className="button button-secondary" onClick={onCancel} disabled={busy}>Anulează</button>
        <button type="button" className={`button ${tone === "danger" ? "button-danger" : "button-primary"}`} onClick={onConfirm} disabled={busy}>{busy ? "Se salvează…" : confirmLabel}</button>
      </div>
    </dialog>
  );
}

/** Shows a one-time secret with a copy action. It is never stored and cannot be shown again. */
export function OneTimeSecret({ label, value }: { label: string; value: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="one-time-secret">
      <span>{label}</span>
      <code data-testid="one-time-secret">{value}</code>
      <button type="button" className="button button-secondary" onClick={() => { void navigator.clipboard?.writeText(value).then(() => setCopied(true), () => setCopied(false)); }}>{copied ? "Copiat" : "Copiază"}</button>
      <small>Parola este afișată o singură dată și nu poate fi recuperată ulterior. Angajatul va fi obligat să o schimbe la prima autentificare.</small>
    </div>
  );
}

import { AUDIT_ACTION_LABELS, TARGET_LABELS, formatDateTime } from "../api/labels";
import type { AuditEvent } from "../api/types";
import { Badge, EmptyState } from "../components/ui";

function summary(event: AuditEvent): string {
  const metadata = event.metadata ?? {};
  const change = (key: string) => {
    const value = metadata[key] as { before?: unknown; after?: unknown } | undefined;
    if (!value || typeof value !== "object") return null;
    const show = (item: unknown) => Array.isArray(item) ? (item.length ? item.join(", ") : "—") : item === null || item === undefined ? "—" : String(item);
    return `${show(value.before)} → ${show(value.after)}`;
  };
  if (event.action.endsWith("_changed") && "after" in metadata) {
    const before = metadata.before; const after = metadata.after;
    const show = (item: unknown) => Array.isArray(item) ? (item.length ? item.join(", ") : "—") : item === null || item === undefined ? "—" : String(item);
    return `${show(before)} → ${show(after)}`;
  }
  return ["permissions", "status", "name", "displayName", "positionTitle", "departmentId", "authorityRank"].map(change).filter(Boolean).join(" · ");
}

export function AuditList({ items, compact = false }: { items: AuditEvent[]; compact?: boolean }) {
  if (items.length === 0) return <EmptyState title="Nicio activitate administrativă.">Modificările IAM apar aici imediat ce sunt salvate.</EmptyState>;
  return (
    <ol className={`audit-list ${compact ? "audit-compact" : ""}`}>
      {items.map((event) => (
        <li key={event.id}>
          <div className="audit-main">
            <strong>{AUDIT_ACTION_LABELS[event.action] ?? event.action}</strong>
            <span>{TARGET_LABELS[event.targetType] ?? event.targetType}: {event.targetLabel}</span>
            {!compact && summary(event) && <span className="audit-change">{summary(event)}</span>}
          </div>
          <div className="audit-meta">
            <span>{event.actorLabel}{event.actorType === "root" && <> <Badge tone="root">principal</Badge></>}</span>
            <time dateTime={event.createdAt}>{formatDateTime(event.createdAt)}</time>
          </div>
        </li>
      ))}
    </ol>
  );
}

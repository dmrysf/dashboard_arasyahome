import { actorName, describeAuditEvent } from "../api/audit";
import { AUDIT_ACTION_LABELS, formatDateTime } from "../api/labels";
import type { AuditEvent } from "../api/types";
import { Badge, EmptyState } from "../components/ui";

export function AuditList({ items, compact = false, stageLabel }: { items: AuditEvent[]; compact?: boolean; stageLabel?: (id: string) => string }) {
  if (items.length === 0) return <EmptyState title="Nicio activitate administrativă.">Modificările IAM apar aici imediat ce sunt salvate.</EmptyState>;
  return (
    <ol className={`audit-list ${compact ? "audit-compact" : ""}`}>
      {items.map((event) => {
        const description = describeAuditEvent(event, stageLabel);
        return (
          <li key={event.id}>
            <div className="audit-main">
              {description.sentences.map((sentence) => <strong key={sentence}>{sentence}</strong>)}
              {!compact && description.details.map((detail) => <span key={detail} className="audit-change">{detail}</span>)}
            </div>
            <div className="audit-meta">
              <Badge>{AUDIT_ACTION_LABELS[event.action] ?? "Modificare"}</Badge>
              <span>{actorName(event)}{event.actorType === "root" && <> <Badge tone="root">protejat</Badge></>}</span>
              <time dateTime={event.createdAt}>{formatDateTime(event.createdAt)}</time>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

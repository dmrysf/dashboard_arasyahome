import { actorName, describeAuditEvent } from "../api/audit";
import type { AuditEvent } from "../api/types";
import { Badge, EmptyState } from "../components/ui";
import { useI18n } from "../i18n/context";

/** `stageLabel` supplies the API's own stage names as a fallback for stage IDs the interface does not know. */
export function AuditList({ items, compact = false, stageLabel }: { items: AuditEvent[]; compact?: boolean; stageLabel?: (id: string) => string | undefined }) {
  const i18n = useI18n();
  const { t } = i18n;
  if (items.length === 0) return <EmptyState title={t.audit.empty}>{t.audit.emptyHint}</EmptyState>;
  return (
    <ol className={`audit-list ${compact ? "audit-compact" : ""}`}>
      {items.map((event) => {
        const description = describeAuditEvent(event, i18n, stageLabel);
        return (
          <li key={event.id}>
            <div className="audit-main">
              {description.sentences.map((sentence) => <strong key={sentence}>{sentence}</strong>)}
              {!compact && description.details.map((detail) => <span key={detail} className="audit-change">{detail}</span>)}
            </div>
            <div className="audit-meta">
              <Badge>{i18n.auditAction(event.action)}</Badge>
              <span>{actorName(event, i18n)}{event.actorType === "root" && <> <Badge tone="root">{t.audit.protectedBadge}</Badge></>}</span>
              <time dateTime={event.createdAt}>{i18n.dateTime(event.createdAt)}</time>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

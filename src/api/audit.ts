import type { Translator } from "../i18n";
import type { AuditEvent } from "./types";

/** "Ion Popescu (ion.popescu)" -> "Ion Popescu". Labels are server snapshots taken when the event happened. */
export function personName(label: string): string {
  return label.replace(/\s*\([^()]*\)\s*$/, "").trim() || label;
}

export function actorName(event: Pick<AuditEvent, "actorType" | "actorLabel">, i18n: Translator): string {
  if (event.actorType === "root") return i18n.t.root.label;
  if (event.actorType === "cli") return i18n.t.auditEvents.cliActor;
  return personName(event.actorLabel);
}

type Change = { before?: unknown; after?: unknown };

function asList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function show(value: unknown, label: (item: string) => string = (item) => item): string {
  if (Array.isArray(value)) return value.length ? asList(value).map(label).join(", ") : "—";
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") return label(String(value));
  return "—";
}

/**
 * Only these documented metadata keys are ever rendered. Unknown keys are ignored, so a future server field
 * can never leak into the interface by accident.
 */
const RENDERED_FIELDS = ["displayName", "positionTitle", "departmentId", "name", "status", "authorityRank", "permissions", "parentId"] as const;

export type AuditDescription = { sentences: string[]; details: string[] };

/**
 * Renders a stored, immutable audit event in the active language from its stable action key. Names inside the
 * event are server snapshots and are shown as recorded; only the surrounding sentence is localized.
 */
export function describeAuditEvent(event: AuditEvent, i18n: Translator, stageFallback: (id: string) => string | undefined = () => undefined): AuditDescription {
  const m = i18n.t.auditEvents;
  const statuses: Record<string, string> = m.statusValues;
  const stageLabel = (id: string) => i18n.stage(id, stageFallback(id));
  const applicationLabel = (key: string) => i18n.application(key);
  const actor = actorName(event, i18n);
  const target = personName(event.targetLabel);
  const metadata = (event.metadata && typeof event.metadata === "object" ? event.metadata : {}) as Record<string, unknown>;
  const before = metadata.before;
  const after = metadata.after;
  const fieldDetails = () => RENDERED_FIELDS.flatMap((key) => {
    const change = metadata[key] as Change | undefined;
    if (!change || typeof change !== "object" || Array.isArray(change)) return [];
    const label = key === "status" ? (item: string) => (Object.hasOwn(statuses, item) ? statuses[item] : item) : undefined;
    return [`${m.fields[key]}: ${show(change.before, label)} → ${show(change.after, label)}`];
  });

  switch (event.action) {
    case "employee.created": {
      const apps = asList(metadata.applications).map(applicationLabel);
      return { sentences: [m.created(actor, target)], details: apps.length ? [m.applicationsDetail(apps.join(", "))] : [] };
    }
    case "employee.updated": return { sentences: [m.updated(actor, target)], details: fieldDetails() };
    case "employee.activated": return { sentences: [m.activated(actor, target)], details: [] };
    case "employee.deactivated": return { sentences: [m.deactivated(actor, target)], details: [] };
    case "employee.password_reset": return { sentences: [m.passwordReset(actor, target)], details: [m.sessionsClosed] };
    case "employee.applications_changed": {
      const was = asList(before);
      const now = asList(after);
      const sentences = [
        ...now.filter((key) => !was.includes(key)).map((key) => m.granted(target, applicationLabel(key))),
        ...was.filter((key) => !now.includes(key)).map((key) => m.revoked(target, applicationLabel(key))),
      ];
      return { sentences: sentences.length ? sentences : [m.accessConfirmed(actor, target)], details: [m.changedBy(actor)] };
    }
    case "employee.roles_changed": return { sentences: [m.rolesChanged(actor, target)], details: [`${show(before)} → ${show(after)}`] };
    case "employee.stages_changed": return { sentences: [m.stagesChanged(actor, target)], details: [`${show(before, stageLabel)} → ${show(after, stageLabel)}`] };
    case "employee.manager_changed": return { sentences: [m.managerChanged(actor, target)], details: [] };
    case "employee.document_scopes_changed": {
      // {before|after: {operate: [...], approve: [...]}}: source keys only, rendered as stored.
      const scope = (value: unknown, capability: "operate" | "approve") => value && typeof value === "object" ? (value as Record<string, unknown>)[capability] : undefined;
      const e = i18n.t.employee;
      return { sentences: [m.documentScopesChanged(actor, target)], details: [
        `${e.scopeOperate}: ${show(scope(before, "operate"))} → ${show(scope(after, "operate"))}`,
        `${e.scopeApprove}: ${show(scope(before, "approve"))} → ${show(scope(after, "approve"))}`,
      ] };
    }
    case "role.created": return { sentences: [m.roleCreated(actor, target)], details: typeof metadata.authorityRank === "number" ? [m.rankDetail(metadata.authorityRank)] : [] };
    case "role.updated": return { sentences: [m.roleUpdated(actor, target)], details: fieldDetails() };
    case "role.deleted": return { sentences: [m.roleDeleted(actor, target)], details: [] };
    case "department.created": return { sentences: [m.departmentCreated(actor, target)], details: [] };
    case "department.updated": return { sentences: [m.departmentUpdated(actor, target)], details: fieldDetails() };
    case "department.deleted": return { sentences: [m.departmentDeleted(actor, target)], details: [] };
    case "production.owner.released":
    case "production.owner.reassigned": {
      // Production ownership interventions: names and the stage are server snapshots; the stage never changes.
      const owner = (value: unknown) => (value && typeof value === "object" && typeof (value as { displayName?: unknown }).displayName === "string" ? (value as { displayName: string }).displayName : m.nobody);
      const stage = metadata.stage && typeof metadata.stage === "object" ? metadata.stage as { id?: unknown; label?: unknown } : {};
      const details = [
        m.ownerChange(owner(metadata.previousOwner), owner(metadata.newOwner)),
        ...(typeof stage.id === "string" ? [m.stageUnchanged(i18n.stage(stage.id, typeof stage.label === "string" ? stage.label : stageFallback(stage.id)))] : []),
      ];
      const sentence = event.action === "production.owner.released" ? m.ownerReleased(actor, event.targetLabel) : m.ownerReassigned(actor, event.targetLabel);
      return { sentences: [sentence], details };
    }
    case "root.bootstrapped": return { sentences: [m.rootBootstrapped], details: [] };
    case "root.password_recovered": return { sentences: [m.rootRecovered], details: [] };
    default: return { sentences: [m.generic(actor, target)], details: [] };
  }
}

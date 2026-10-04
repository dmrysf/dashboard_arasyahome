import { applicationLabel } from "./labels";
import type { AuditEvent } from "./types";

/** "Ion Popescu (ion.popescu)" -> "Ion Popescu". Labels are server snapshots taken when the event happened. */
export function personName(label: string): string {
  return label.replace(/\s*\([^()]*\)\s*$/, "").trim() || label;
}

export function actorName(event: Pick<AuditEvent, "actorType" | "actorLabel">): string {
  if (event.actorType === "root") return "Administrator principal";
  if (event.actorType === "cli") return "Consola serverului";
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

const STATUS: Record<string, string> = { active: "activ", inactive: "inactiv", suspended: "suspendat" };
const FIELD: Record<string, string> = {
  displayName: "nume", positionTitle: "funcție", departmentId: "departament", name: "nume", status: "status",
  authorityRank: "nivel de autoritate", permissions: "permisiuni", parentId: "departament părinte",
};

/**
 * Only these documented metadata keys are ever rendered. Unknown keys are ignored, so a future server field
 * can never leak into the interface by accident.
 */
const RENDERED_FIELDS = ["displayName", "positionTitle", "departmentId", "name", "status", "authorityRank", "permissions", "parentId"];

export type AuditDescription = { sentences: string[]; details: string[] };

export function describeAuditEvent(event: AuditEvent, stageLabel: (id: string) => string = (id) => id): AuditDescription {
  const actor = actorName(event);
  const target = personName(event.targetLabel);
  const metadata = (event.metadata && typeof event.metadata === "object" ? event.metadata : {}) as Record<string, unknown>;
  const before = metadata.before;
  const after = metadata.after;
  const fieldDetails = () => RENDERED_FIELDS.flatMap((key) => {
    const change = metadata[key] as Change | undefined;
    if (!change || typeof change !== "object" || Array.isArray(change)) return [];
    const label = key === "status" ? (item: string) => STATUS[item] ?? item : undefined;
    return [`${FIELD[key]}: ${show(change.before, label)} → ${show(change.after, label)}`];
  });

  switch (event.action) {
    case "employee.created": {
      const apps = asList(metadata.applications).map(applicationLabel);
      return { sentences: [`${actor} a creat contul ${target}.`], details: apps.length ? [`aplicații: ${apps.join(", ")}`] : [] };
    }
    case "employee.updated": return { sentences: [`${actor} a modificat profilul utilizatorului ${target}.`], details: fieldDetails() };
    case "employee.activated": return { sentences: [`${actor} a activat utilizatorul ${target}.`], details: [] };
    case "employee.deactivated": return { sentences: [`${actor} a dezactivat utilizatorul ${target}.`], details: [] };
    case "employee.password_reset": return { sentences: [`${actor} a resetat parola utilizatorului ${target}.`], details: ["toate sesiunile utilizatorului au fost închise"] };
    case "employee.applications_changed": {
      const was = asList(before);
      const now = asList(after);
      const sentences = [
        ...now.filter((key) => !was.includes(key)).map((key) => `${target} a primit acces la ${applicationLabel(key)}.`),
        ...was.filter((key) => !now.includes(key)).map((key) => `${target} nu mai are acces la ${applicationLabel(key)}.`),
      ];
      return { sentences: sentences.length ? sentences : [`${actor} a confirmat accesul la aplicații pentru ${target}.`], details: [`modificat de ${actor}`] };
    }
    case "employee.roles_changed": return { sentences: [`${actor} a modificat rolurile utilizatorului ${target}.`], details: [`${show(before)} → ${show(after)}`] };
    case "employee.stages_changed": return { sentences: [`${actor} a modificat etapele Staff ale utilizatorului ${target}.`], details: [`${show(before, stageLabel)} → ${show(after, stageLabel)}`] };
    case "employee.manager_changed": return { sentences: [`${actor} a schimbat managerul direct al utilizatorului ${target}.`], details: [] };
    case "role.created": return { sentences: [`${actor} a creat rolul ${target}.`], details: typeof metadata.authorityRank === "number" ? [`nivel de autoritate: ${metadata.authorityRank}`] : [] };
    case "role.updated": return { sentences: [`${actor} a modificat rolul ${target}.`], details: fieldDetails() };
    case "role.deleted": return { sentences: [`${actor} a șters rolul ${target}.`], details: [] };
    case "department.created": return { sentences: [`${actor} a creat departamentul ${target}.`], details: [] };
    case "department.updated": return { sentences: [`${actor} a modificat departamentul ${target}.`], details: fieldDetails() };
    case "department.deleted": return { sentences: [`${actor} a șters departamentul ${target}.`], details: [] };
    case "root.bootstrapped": return { sentences: ["Administratorul principal a fost creat din consola serverului."], details: [] };
    case "root.password_recovered": return { sentences: ["Parola administratorului principal a fost recuperată din consola serverului."], details: [] };
    default: return { sentences: [`${actor} a efectuat o modificare administrativă asupra ${target}.`], details: [] };
  }
}

import type { EmployeeSummary, WorkflowStage } from "../api/types";
import { useDashboard } from "../app/context";
import { useLoader } from "../app/useLoader";
import { Badge, Card, ErrorBanner, Loading, Notice, PageHeader } from "../components/ui";
import { useI18n } from "../i18n/context";
import { loadAllEmployees } from "./readiness";

export type StageCoverage = {
  stage: WorkflowStage;
  ready: EmployeeSummary[];
  pending: EmployeeSummary[];
  blocked: Array<{ employee: EmployeeSummary; reason: "inactive" | "noStaff" }>;
};

/**
 * Who can work each canonical stage in Staff, from the identities' own grants: an active account with Staff
 * access and the stage. Nothing is derived from a title or department. A stage held only by an inactive
 * account or by an account without Staff access is not covered.
 */
export function stageCoverage(stages: WorkflowStage[], employees: EmployeeSummary[]): { rows: StageCoverage[]; withoutStages: EmployeeSummary[] } {
  const people = employees.filter((employee) => !employee.isRoot);
  const rows = stages.map((stage) => {
    const row: StageCoverage = { stage, ready: [], pending: [], blocked: [] };
    for (const employee of people.filter((item) => item.stageIds.includes(stage.id))) {
      if (employee.status !== "active") row.blocked.push({ employee, reason: "inactive" });
      else if (!employee.applications.includes("staff")) row.blocked.push({ employee, reason: "noStaff" });
      else (employee.mustChangePassword ? row.pending : row.ready).push(employee);
    }
    return row;
  });
  const withoutStages = people.filter((employee) => employee.status === "active" && employee.applications.includes("staff") && employee.stageIds.length === 0);
  return { rows, withoutStages };
}

export function StageCoveragePage() {
  const { api, can, navigate } = useDashboard();
  const { t, stage: stageName } = useI18n();
  const c = t.stageCoverage;
  const workflow = useLoader(() => api.workflow());
  const directory = useLoader(() => can("employees.view") ? loadAllEmployees(api, {}) : Promise.resolve({ items: [], truncated: false }));
  const error = workflow.error ?? directory.error;
  if (error) return <div className="page"><ErrorBanner error={error} onRetry={() => { workflow.reload(); directory.reload(); }} /></div>;
  if (!workflow.data || !directory.data) return <div className="page"><Loading /></div>;
  const { rows, withoutStages } = stageCoverage(workflow.data.stages, directory.data.items);
  const uncovered = rows.filter((row) => row.ready.length === 0).length;
  const person = (employee: EmployeeSummary) => (
    <a key={employee.id} href={`/angajati/${employee.id}`} onClick={(event) => { event.preventDefault(); navigate(`/angajati/${employee.id}`); }}>{employee.displayName}</a>
  );
  const people = (items: EmployeeSummary[]) => items.length ? <span className="name-list">{items.map(person)}</span> : <span className="muted">{c.none}</span>;
  return (
    <div className="page">
      <button type="button" className="back-link" onClick={() => navigate("/angajati")}>{c.back}</button>
      <PageHeader title={c.title} description={c.description} />
      {directory.data.truncated && <Notice tone="warning">{c.truncated}</Notice>}
      <Notice tone={uncovered ? "warning" : "success"}>{uncovered ? c.uncovered(uncovered) : c.covered}</Notice>
      <div className="table-wrap">
        <table className="data-table stage-coverage">
          <thead><tr><th>{c.stage}</th><th>{c.ready}</th><th>{c.pending}</th><th>{c.blocked}</th></tr></thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.stage.id} data-stage={row.stage.id} data-covered={row.ready.length > 0 ? "true" : "false"}>
                <td data-label={c.stage}><span className="ordinal">{row.stage.ordinal}</span> {stageName(row.stage.id, row.stage.label)} {row.ready.length === 0 && <Badge tone="warning">{c.none}</Badge>}</td>
                <td data-label={c.ready}>{people(row.ready)}</td>
                <td data-label={c.pending}>{people(row.pending)}</td>
                <td data-label={c.blocked}>{row.blocked.length ? <span className="name-list">{row.blocked.map(({ employee, reason }) => <span key={employee.id}>{person(employee)} <small className="muted">({c.blockedReason[reason]})</small></span>)}</span> : <span className="muted">—</span>}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {withoutStages.length > 0 && (
        <Card title={c.withoutStages} description={c.withoutStagesHint} className="section-gap">
          <span className="name-list" data-without-stages>{withoutStages.map(person)}</span>
        </Card>
      )}
    </div>
  );
}

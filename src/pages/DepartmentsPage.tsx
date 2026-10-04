import { useState } from "react";
import { useDashboard } from "../app/context";
import { useLoader } from "../app/useLoader";
import type { Department } from "../api/types";
import { Card, ConfirmDialog, EmptyState, ErrorBanner, Field, Loading, Notice, PageHeader, StatusBadge } from "../components/ui";
import { toProblem, ValidationProblem, type NoticeKey, type Problem } from "../i18n";
import { useI18n } from "../i18n/context";

export function DepartmentsPage() {
  const { api, can } = useDashboard();
  const { t, number } = useI18n();
  const departments = useLoader(() => api.departments());
  const [draft, setDraft] = useState({ name: "", description: "", parentId: "" });
  const [editing, setEditing] = useState<Department | null>(null);
  const [edit, setEdit] = useState({ name: "", description: "", parentId: "" });
  const [pending, setPending] = useState<{ kind: "deactivate" | "delete"; department: Department } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Problem | null>(null);
  const [message, setMessage] = useState<NoticeKey | null>(null);

  async function run(action: () => Promise<unknown>, success: NoticeKey) {
    setBusy(true); setError(null); setMessage(null);
    try { await action(); setMessage(success); departments.reload(); }
    catch (caught) { setError(toProblem(caught)); }
    finally { setBusy(false); setPending(null); }
  }
  const hasChildren = (id: number) => Boolean(departments.data?.items.some((item) => item.parentId === id));
  const nameOf = (id: number | null) => departments.data?.items.find((item) => item.id === id)?.name ?? "—";

  return (
    <div className="page">
      <PageHeader title={t.departments.title} description={t.departments.description} />
      {message && <Notice tone="success">{t.notices[message]}</Notice>}
      {error && <ErrorBanner error={error} />}
      {can("departments.create") && (
        <Card title={t.departments.create}>
          <form className="inline-form" onSubmit={(event) => { event.preventDefault(); if (draft.name.trim().length < 2) { setError(new ValidationProblem("departmentNameShort")); return; } void run(() => api.createDepartment({ name: draft.name.trim(), description: draft.description.trim() || null, parentId: draft.parentId ? Number(draft.parentId) : null }).then(() => setDraft({ name: "", description: "", parentId: "" })), "departmentCreated"); }}>
            <Field label={t.departments.name}>{(id) => <input id={id} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />}</Field>
            <Field label={t.departments.descriptionField}>{(id) => <input id={id} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} />}</Field>
            <Field label={t.departments.parent}>{(id) => <select id={id} value={draft.parentId} onChange={(event) => setDraft({ ...draft, parentId: event.target.value })}><option value="">{t.departments.noParent}</option>{departments.data?.items.filter((d) => d.status === "active").map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>}</Field>
            <button type="submit" className="button button-primary" disabled={busy}>{t.departments.add}</button>
          </form>
        </Card>
      )}
      {departments.error && <ErrorBanner error={departments.error} onRetry={departments.reload} />}
      {!departments.data && !departments.error && <Loading />}
      {departments.data && (departments.data.items.length === 0 ? <EmptyState title={t.departments.empty} /> : (
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>{t.departments.department}</th><th>{t.departments.parentShort}</th><th>{t.departments.employees}</th><th>{t.departments.status}</th><th><span className="sr-only">{t.common.actions}</span></th></tr></thead>
            <tbody>
              {departments.data.items.map((department) => (
                <tr key={department.id}>
                  <td data-label={t.departments.department}><strong>{department.name}</strong>{department.description && <div className="muted small">{department.description}</div>}</td>
                  <td data-label={t.departments.parentShort}>{nameOf(department.parentId)}</td>
                  <td data-label={t.departments.employees}>{t.departments.employeeCount(number(department.activeEmployeeCount), number(department.employeeCount))}</td>
                  <td data-label={t.departments.status}><StatusBadge status={department.status} /></td>
                  <td className="row-actions">
                    {can("departments.update") && <button type="button" className="button button-ghost" onClick={() => { setEditing(department); setEdit({ name: department.name, description: department.description ?? "", parentId: department.parentId === null ? "" : String(department.parentId) }); }}>{t.common.edit}</button>}
                    {can("departments.update") && (department.status === "active"
                      ? <button type="button" className="button button-ghost" disabled={department.activeEmployeeCount > 0} title={department.activeEmployeeCount > 0 ? t.departments.moveEmployeesFirst : undefined} onClick={() => setPending({ kind: "deactivate", department })}>{t.common.deactivate}</button>
                      : <button type="button" className="button button-ghost" onClick={() => void run(() => api.updateDepartment(department.id, { status: "active" }), "departmentActivated")}>{t.common.activate}</button>)}
                    {can("departments.delete") && <button type="button" className="button button-ghost" disabled={department.employeeCount > 0 || hasChildren(department.id)} title={department.employeeCount > 0 || hasChildren(department.id) ? t.departments.hasDependents : undefined} onClick={() => setPending({ kind: "delete", department })}>{t.common.delete}</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
      {editing && <ConfirmDialog title={t.departments.editTitle(editing.name)} confirmLabel={t.common.save} busy={busy} onCancel={() => setEditing(null)} onConfirm={() => {
        const target = editing;
        if (edit.name.trim().length < 2) { setError(new ValidationProblem("departmentNameShort")); return; }
        setEditing(null);
        void run(() => api.updateDepartment(target.id, { name: edit.name.trim(), description: edit.description.trim() || null, parentId: edit.parentId ? Number(edit.parentId) : null }), "departmentUpdated");
      }}>
        <Field label={t.departments.name}>{(id) => <input id={id} value={edit.name} onChange={(event) => setEdit({ ...edit, name: event.target.value })} />}</Field>
        <Field label={t.departments.descriptionField}>{(id) => <input id={id} value={edit.description} onChange={(event) => setEdit({ ...edit, description: event.target.value })} />}</Field>
        <Field label={t.departments.parent}>{(id) => <select id={id} value={edit.parentId} onChange={(event) => setEdit({ ...edit, parentId: event.target.value })}>
          <option value="">{t.departments.noParent}</option>
          {departments.data?.items.filter((department) => department.id !== editing.id).map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}
        </select>}</Field>
      </ConfirmDialog>}
      {pending && (pending.kind === "deactivate"
        ? <ConfirmDialog title={t.departments.deactivateTitle} confirmLabel={t.common.deactivate} busy={busy} onCancel={() => setPending(null)}
            onConfirm={() => { void run(() => api.updateDepartment(pending.department.id, { status: "inactive" }), "changeSaved"); }}><p>{t.departments.deactivateBody(pending.department.name)}</p></ConfirmDialog>
        : <ConfirmDialog title={t.departments.deleteTitle} confirmLabel={t.common.delete} tone="danger" busy={busy} onCancel={() => setPending(null)}
            onConfirm={() => { void run(() => api.deleteDepartment(pending.department.id), "changeSaved"); }}><p>{t.departments.deleteBody(pending.department.name)}</p></ConfirmDialog>)}
    </div>
  );
}

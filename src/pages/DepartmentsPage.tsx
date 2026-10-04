import { useState } from "react";
import { useDashboard } from "../app/context";
import { useLoader } from "../app/useLoader";
import { errorMessage } from "../api/labels";
import type { Department } from "../api/types";
import { Card, ConfirmDialog, EmptyState, ErrorBanner, Field, Loading, Notice, PageHeader, StatusBadge } from "../components/ui";

export function DepartmentsPage() {
  const { api, can } = useDashboard();
  const departments = useLoader(() => api.departments());
  const [draft, setDraft] = useState({ name: "", description: "", parentId: "" });
  const [editing, setEditing] = useState<Department | null>(null);
  const [edit, setEdit] = useState({ name: "", description: "", parentId: "" });
  const [pending, setPending] = useState<{ title: string; label: string; tone?: "danger"; body: string; run: () => Promise<unknown> } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  async function run(action: () => Promise<unknown>, success: string) {
    setBusy(true); setError(""); setMessage("");
    try { await action(); setMessage(success); departments.reload(); }
    catch (caught) { setError(errorMessage(caught)); }
    finally { setBusy(false); setPending(null); }
  }
  const hasChildren = (id: number) => Boolean(departments.data?.items.some((item) => item.parentId === id));
  const nameOf = (id: number | null) => departments.data?.items.find((item) => item.id === id)?.name ?? "—";

  return (
    <div className="page">
      <PageHeader title="Departamente" description="Structura organizațională. Departamentul nu acordă drepturi." />
      {message && <Notice tone="success">{message}</Notice>}
      {error && <ErrorBanner message={error} />}
      {can("departments.create") && (
        <Card title="Departament nou">
          <form className="inline-form" onSubmit={(event) => { event.preventDefault(); if (draft.name.trim().length < 2) { setError("Numele departamentului trebuie să aibă cel puțin 2 caractere."); return; } void run(() => api.createDepartment({ name: draft.name.trim(), description: draft.description.trim() || null, parentId: draft.parentId ? Number(draft.parentId) : null }).then(() => setDraft({ name: "", description: "", parentId: "" })), "Departamentul a fost creat."); }}>
            <Field label="Nume">{(id) => <input id={id} value={draft.name} onChange={(event) => setDraft({ ...draft, name: event.target.value })} />}</Field>
            <Field label="Descriere">{(id) => <input id={id} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} />}</Field>
            <Field label="Departament părinte">{(id) => <select id={id} value={draft.parentId} onChange={(event) => setDraft({ ...draft, parentId: event.target.value })}><option value="">Fără</option>{departments.data?.items.filter((d) => d.status === "active").map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}</select>}</Field>
            <button type="submit" className="button button-primary" disabled={busy}>Adaugă</button>
          </form>
        </Card>
      )}
      {departments.error && <ErrorBanner message={departments.error} onRetry={departments.reload} />}
      {!departments.data && !departments.error && <Loading />}
      {departments.data && (departments.data.items.length === 0 ? <EmptyState title="Niciun departament." /> : (
        <div className="table-wrap">
          <table className="data-table">
            <thead><tr><th>Departament</th><th>Părinte</th><th>Angajați</th><th>Status</th><th><span className="sr-only">Acțiuni</span></th></tr></thead>
            <tbody>
              {departments.data.items.map((department) => (
                <tr key={department.id}>
                  <td data-label="Departament"><strong>{department.name}</strong>{department.description && <div className="muted small">{department.description}</div>}</td>
                  <td data-label="Părinte">{nameOf(department.parentId)}</td>
                  <td data-label="Angajați">{department.activeEmployeeCount} activi / {department.employeeCount}</td>
                  <td data-label="Status"><StatusBadge status={department.status} /></td>
                  <td className="row-actions">
                    {can("departments.update") && <button type="button" className="button button-ghost" onClick={() => { setEditing(department); setEdit({ name: department.name, description: department.description ?? "", parentId: department.parentId === null ? "" : String(department.parentId) }); }}>Editează</button>}
                    {can("departments.update") && (department.status === "active"
                      ? <button type="button" className="button button-ghost" disabled={department.activeEmployeeCount > 0} title={department.activeEmployeeCount > 0 ? "Mută întâi angajații activi." : undefined} onClick={() => setPending({ title: "Dezactivezi departamentul?", label: "Dezactivează", body: `${department.name} nu va mai putea fi atribuit.`, run: () => api.updateDepartment(department.id, { status: "inactive" }) })}>Dezactivează</button>
                      : <button type="button" className="button button-ghost" onClick={() => void run(() => api.updateDepartment(department.id, { status: "active" }), "Departamentul a fost activat.")}>Activează</button>)}
                    {can("departments.delete") && <button type="button" className="button button-ghost" disabled={department.employeeCount > 0 || hasChildren(department.id)} title={department.employeeCount > 0 || hasChildren(department.id) ? "Departamentul are angajați sau subdepartamente." : undefined} onClick={() => setPending({ title: "Ștergi departamentul?", label: "Șterge", tone: "danger", body: `${department.name} va fi șters definitiv.`, run: () => api.deleteDepartment(department.id) })}>Șterge</button>}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ))}
      {editing && <ConfirmDialog title={`Editează ${editing.name}`} confirmLabel="Salvează" busy={busy} onCancel={() => setEditing(null)} onConfirm={() => {
        const target = editing;
        if (edit.name.trim().length < 2) { setError("Numele departamentului trebuie să aibă cel puțin 2 caractere."); return; }
        setEditing(null);
        void run(() => api.updateDepartment(target.id, { name: edit.name.trim(), description: edit.description.trim() || null, parentId: edit.parentId ? Number(edit.parentId) : null }), "Departamentul a fost actualizat.");
      }}>
        <Field label="Nume">{(id) => <input id={id} value={edit.name} onChange={(event) => setEdit({ ...edit, name: event.target.value })} />}</Field>
        <Field label="Descriere">{(id) => <input id={id} value={edit.description} onChange={(event) => setEdit({ ...edit, description: event.target.value })} />}</Field>
        <Field label="Departament părinte">{(id) => <select id={id} value={edit.parentId} onChange={(event) => setEdit({ ...edit, parentId: event.target.value })}>
          <option value="">Fără</option>
          {departments.data?.items.filter((department) => department.id !== editing.id).map((department) => <option key={department.id} value={department.id}>{department.name}</option>)}
        </select>}</Field>
      </ConfirmDialog>}
      {pending && <ConfirmDialog title={pending.title} confirmLabel={pending.label} tone={pending.tone} busy={busy} onCancel={() => setPending(null)} onConfirm={() => { void run(pending.run, "Modificarea a fost salvată."); }}><p>{pending.body}</p></ConfirmDialog>}
    </div>
  );
}

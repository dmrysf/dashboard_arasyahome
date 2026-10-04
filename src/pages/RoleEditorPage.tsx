import { useMemo, useState } from "react";
import { useDashboard } from "../app/context";
import { useLoader } from "../app/useLoader";
import { CATEGORY_LABELS, CATEGORY_ORDER, errorMessage } from "../api/labels";
import type { Permission, Role } from "../api/types";
import { Card, ConfirmDialog, ErrorBanner, Field, Loading, Notice, PageHeader } from "../components/ui";

/** Groups the server catalog by category in a stable, readable order. */
export function groupPermissions(items: Permission[]): Array<{ category: string; label: string; items: Permission[] }> {
  const groups = new Map<string, Permission[]>();
  for (const permission of items.filter((item) => item.roleGrantable)) groups.set(permission.category, [...(groups.get(permission.category) ?? []), permission]);
  return [...groups.entries()]
    .sort(([a], [b]) => (CATEGORY_ORDER.indexOf(a) + 1 || 99) - (CATEGORY_ORDER.indexOf(b) + 1 || 99))
    .map(([category, permissions]) => ({ category, label: CATEGORY_LABELS[category] ?? category, items: permissions }));
}

export function RoleEditorPage({ id }: { id?: number }) {
  const { api } = useDashboard();
  const catalog = useLoader(() => api.permissions());
  const role = useLoader(() => id === undefined ? Promise.resolve(null) : api.role(id), String(id));
  const [saved, setSaved] = useState(false);
  if ((catalog.error && !catalog.data) || (role.error && !role.data)) return <div className="page"><ErrorBanner message={catalog.error || role.error} onRetry={() => { catalog.reload(); role.reload(); }} /></div>;
  if (!catalog.data || (id !== undefined && !role.data)) return <div className="page"><Loading /></div>;
  return <RoleEditor key={role.revision} id={id} existing={role.data} catalog={catalog.data.items} saved={saved} onSaved={() => { setSaved(true); role.reload(); }} />;
}

/** Form state starts from the latest server copy of the role; each save remounts it from the server. */
export function RoleEditor({ id, existing: role, catalog, saved, onSaved }: { id?: number; existing: Role | null; catalog: Permission[]; saved: boolean; onSaved: () => void }) {
  const { api, can, me, navigate } = useDashboard();
  const ceiling = me.isRoot ? 999 : (me.authorityRank ?? 1) - 1;
  const [name, setName] = useState(role?.name ?? "");
  const [description, setDescription] = useState(role?.description ?? "");
  const [rank, setRank] = useState(String(role?.authorityRank ?? Math.max(1, Math.min(100, ceiling))));
  const [status, setStatus] = useState<"active" | "inactive">(role?.status ?? "active");
  const [selected, setSelected] = useState<string[]>(role?.permissions ?? []);
  const [confirming, setConfirming] = useState<"save" | "delete" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const groups = useMemo(() => groupPermissions(catalog), [catalog]);

  const editable = id === undefined ? can("roles.create") : can("roles.update") && Boolean(role?.manageable);
  const rankValue = Number(rank);
  const rankValid = Number.isInteger(rankValue) && rankValue >= 1 && rankValue <= ceiling;
  const canCreateAny = ceiling >= 1;

  async function save() {
    setBusy(true); setError("");
    const body = { name: name.trim(), description: description.trim() || null, authorityRank: rankValue, permissions: selected };
    try {
      if (id === undefined) { const created = await api.createRole(body); navigate(`/roluri/${created.role.id}`); }
      else { await api.updateRole(id, { ...body, status }); onSaved(); }
    } catch (caught) { setError(errorMessage(caught)); }
    finally { setBusy(false); setConfirming(null); }
  }
  async function remove() {
    if (id === undefined) return;
    setBusy(true); setError("");
    try { await api.deleteRole(id); navigate("/roluri"); }
    catch (caught) { setError(errorMessage(caught)); setConfirming(null); setBusy(false); }
  }

  return (
    <div className="page">
      <button type="button" className="back-link" onClick={() => navigate("/roluri")}>← Roluri</button>
      <PageHeader title={id === undefined ? "Rol nou" : role?.name ?? "Rol"} description="Permisiunile atașate sunt singura sursă de autorizare; numele rolului este doar o etichetă."
        actions={editable && canCreateAny ? <div className="button-row">
          {id !== undefined && can("roles.delete") && <button type="button" className="button button-ghost" disabled={busy || (role?.userCount ?? 0) > 0} title={(role?.userCount ?? 0) > 0 ? "Rolul este încă atribuit." : undefined} onClick={() => setConfirming("delete")}>Șterge rolul</button>}
          <button type="button" className="button button-primary" disabled={busy || name.trim().length < 2 || !rankValid} onClick={() => setConfirming("save")}>{id === undefined ? "Creează rolul" : "Salvează"}</button>
        </div> : undefined} />
      {!editable && <Notice>Rolul este la nivelul tău de autoritate sau peste el, ori nu ai permisiunea de a-l modifica. Poți doar vizualiza permisiunile.</Notice>}
      {editable && !canCreateAny && <Notice>Nivelul tău de autoritate nu permite crearea sau modificarea rolurilor.</Notice>}
      {saved && !error && <Notice tone="success">Rolul a fost salvat. Angajații cu acest rol primesc modificarea la următoarea cerere.</Notice>}
      {error && <ErrorBanner message={error} />}
      <Card title="Detalii">
        <div className="form-grid">
          <Field label="Nume rol">{(fid) => <input id={fid} disabled={!editable} value={name} onChange={(event) => setName(event.target.value)} />}</Field>
          <Field label="Nivel de autoritate" hint={`Între 1 și ${ceiling}. Rolurile cu nivel mai mare pot gestiona rolurile cu nivel mai mic.`}>{(fid) => <input id={fid} type="number" min={1} max={ceiling} disabled={!editable} value={rank} aria-invalid={!rankValid} onChange={(event) => setRank(event.target.value)} />}</Field>
          <Field label="Descriere">{(fid) => <input id={fid} disabled={!editable} value={description} onChange={(event) => setDescription(event.target.value)} />}</Field>
          {id !== undefined && <Field label="Status">{(fid) => <select id={fid} disabled={!editable} value={status} onChange={(event) => setStatus(event.target.value as "active" | "inactive")}><option value="active">Activ</option><option value="inactive">Inactiv</option></select>}</Field>}
        </div>
      </Card>
      <div className="permission-groups">
        {groups.map((group) => (
          <Card key={group.category} title={group.label}>
            <div className="check-list">
              {group.items.map((permission) => (
                <label key={permission.key} className={`check ${editable && permission.grantableByMe ? "" : "disabled"}`} title={permission.grantableByMe ? permission.description : "Nu poți acorda o permisiune pe care nu o deții."}>
                  <input type="checkbox" disabled={!editable || !permission.grantableByMe} checked={selected.includes(permission.key)}
                    onChange={() => setSelected(selected.includes(permission.key) ? selected.filter((key) => key !== permission.key) : [...selected, permission.key])} />
                  {permission.label} <small className="mono">{permission.key}</small>
                </label>
              ))}
            </div>
          </Card>
        ))}
      </div>
      {confirming === "save" && <ConfirmDialog title={id === undefined ? "Creezi rolul?" : "Salvezi rolul?"} confirmLabel="Confirmă" busy={busy} onCancel={() => setConfirming(null)} onConfirm={() => { void save(); }}>
        <p><strong>{name.trim()}</strong> · nivel {rankValue} · {selected.length} permisiuni.</p>
        {id !== undefined && <p>Angajații care au acest rol primesc noile permisiuni la următoarea cerere.</p>}
      </ConfirmDialog>}
      {confirming === "delete" && <ConfirmDialog title="Ștergi rolul?" confirmLabel="Șterge" tone="danger" busy={busy} onCancel={() => setConfirming(null)} onConfirm={() => { void remove(); }}><p>Rolul nu mai este atribuit nimănui și va fi șters definitiv. Acțiunea rămâne în auditul IAM.</p></ConfirmDialog>}
    </div>
  );
}

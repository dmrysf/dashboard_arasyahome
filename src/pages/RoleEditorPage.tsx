import { useEffect, useMemo, useState } from "react";
import { useDashboard } from "../app/context";
import { useLoader } from "../app/useLoader";
import { CATEGORY_LABELS, CATEGORY_ORDER, errorMessage } from "../api/labels";
import type { Permission } from "../api/types";
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
  const { api, can, me, navigate } = useDashboard();
  const catalog = useLoader(() => api.permissions(), [api]);
  const role = useLoader(() => id === undefined ? Promise.resolve(null) : api.role(id), [api, id]);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [rank, setRank] = useState("100");
  const [status, setStatus] = useState<"active" | "inactive">("active");
  const [selected, setSelected] = useState<string[]>([]);
  const [confirming, setConfirming] = useState<"save" | "delete" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!role.data) return;
    setName(role.data.name); setDescription(role.data.description ?? ""); setRank(String(role.data.authorityRank)); setStatus(role.data.status); setSelected(role.data.permissions);
  }, [role.data]);
  const groups = useMemo(() => groupPermissions(catalog.data?.items ?? []), [catalog.data]);

  if (catalog.error || role.error) return <div className="page"><ErrorBanner message={catalog.error || role.error} /></div>;
  if (!catalog.data || (id !== undefined && !role.data)) return <div className="page"><Loading /></div>;
  const editable = id === undefined ? can("roles.create") : can("roles.update") && Boolean(role.data?.manageable);
  const ceiling = me.isRoot ? 999 : (me.authorityRank ?? 0) - 1;

  async function save() {
    setBusy(true); setError("");
    const body = { name: name.trim(), description: description.trim() || null, authorityRank: Number(rank), permissions: selected };
    try {
      if (id === undefined) { const created = await api.createRole(body); navigate(`/roluri/${created.role.id}`); }
      else { await api.updateRole(id, { ...body, status }); role.reload(); }
      setConfirming(null);
    } catch (caught) { setError(errorMessage(caught)); setConfirming(null); }
    finally { setBusy(false); }
  }
  async function remove() {
    if (id === undefined) return;
    setBusy(true); setError("");
    try { await api.deleteRole(id); navigate("/roluri"); }
    catch (caught) { setError(errorMessage(caught)); setConfirming(null); }
    finally { setBusy(false); }
  }

  return (
    <div className="page">
      <button type="button" className="back-link" onClick={() => navigate("/roluri")}>← Roluri</button>
      <PageHeader title={id === undefined ? "Rol nou" : role.data?.name ?? "Rol"} description="Permisiunile atașate sunt singura sursă de autorizare; numele rolului este doar o etichetă."
        actions={editable ? <div className="button-row">
          {id !== undefined && can("roles.delete") && <button type="button" className="button button-ghost" disabled={busy || (role.data?.userCount ?? 0) > 0} onClick={() => setConfirming("delete")}>Șterge rolul</button>}
          <button type="button" className="button button-primary" disabled={busy || !name.trim()} onClick={() => setConfirming("save")}>{id === undefined ? "Creează rolul" : "Salvează"}</button>
        </div> : undefined} />
      {!editable && <Notice>Rolul este la nivelul tău de autoritate sau peste el, ori nu ai permisiunea de a-l modifica. Poți doar vizualiza permisiunile.</Notice>}
      {error && <ErrorBanner message={error} />}
      <Card title="Detalii">
        <div className="form-grid">
          <Field label="Nume rol">{(fid) => <input id={fid} disabled={!editable} value={name} onChange={(event) => setName(event.target.value)} />}</Field>
          <Field label="Nivel de autoritate" hint={`Între 1 și ${ceiling}. Rolurile cu nivel mai mare pot gestiona rolurile cu nivel mai mic.`}>{(fid) => <input id={fid} type="number" min={1} max={ceiling} disabled={!editable} value={rank} onChange={(event) => setRank(event.target.value)} />}</Field>
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
        <p><strong>{name}</strong> · nivel {rank} · {selected.length} permisiuni.</p>
        {id !== undefined && <p>Angajații care au acest rol primesc noile permisiuni la următoarea cerere.</p>}
      </ConfirmDialog>}
      {confirming === "delete" && <ConfirmDialog title="Ștergi rolul?" confirmLabel="Șterge" tone="danger" busy={busy} onCancel={() => setConfirming(null)} onConfirm={() => { void remove(); }}><p>Rolul nu mai este atribuit nimănui și va fi șters definitiv. Acțiunea rămâne în auditul IAM.</p></ConfirmDialog>}
    </div>
  );
}

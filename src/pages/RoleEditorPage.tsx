import { useMemo, useState } from "react";
import { useDashboard } from "../app/context";
import { useLoader } from "../app/useLoader";
import type { Permission, Role } from "../api/types";
import { Card, ConfirmDialog, ErrorBanner, Field, Loading, Notice, PageHeader } from "../components/ui";
import { CATEGORY_ORDER, toProblem, type Problem } from "../i18n";
import { useI18n } from "../i18n/context";

/** Groups the server catalog by its stable category key in a fixed, readable order. */
export function groupPermissions(items: Permission[]): Array<{ category: string; items: Permission[] }> {
  const groups = new Map<string, Permission[]>();
  for (const permission of items.filter((item) => item.roleGrantable)) groups.set(permission.category, [...(groups.get(permission.category) ?? []), permission]);
  return [...groups.entries()]
    .sort(([a], [b]) => (CATEGORY_ORDER.indexOf(a) + 1 || 99) - (CATEGORY_ORDER.indexOf(b) + 1 || 99))
    .map(([category, permissions]) => ({ category, items: permissions }));
}

export function RoleEditorPage({ id }: { id?: number }) {
  const { api } = useDashboard();
  const catalog = useLoader(() => api.permissions());
  const role = useLoader(() => id === undefined ? Promise.resolve(null) : api.role(id), String(id));
  const [saved, setSaved] = useState(false);
  if ((catalog.error && !catalog.data) || (role.error && !role.data)) return <div className="page"><ErrorBanner error={catalog.error ?? role.error} onRetry={() => { catalog.reload(); role.reload(); }} /></div>;
  if (!catalog.data || (id !== undefined && !role.data)) return <div className="page"><Loading /></div>;
  return <RoleEditor key={role.revision} id={id} existing={role.data} catalog={catalog.data.items} saved={saved} onSaved={() => { setSaved(true); role.reload(); }} />;
}

/** Form state starts from the latest server copy of the role; each save remounts it from the server. */
export function RoleEditor({ id, existing: role, catalog, saved, onSaved }: { id?: number; existing: Role | null; catalog: Permission[]; saved: boolean; onSaved: () => void }) {
  const { api, can, me, navigate } = useDashboard();
  const { t, category, permission: permissionLabel, permissionDescription } = useI18n();
  const ceiling = me.isRoot ? 999 : (me.authorityRank ?? 1) - 1;
  const [name, setName] = useState(role?.name ?? "");
  const [description, setDescription] = useState(role?.description ?? "");
  const [rank, setRank] = useState(String(role?.authorityRank ?? Math.max(1, Math.min(100, ceiling))));
  const [status, setStatus] = useState<"active" | "inactive">(role?.status ?? "active");
  const [selected, setSelected] = useState<string[]>(role?.permissions ?? []);
  const [confirming, setConfirming] = useState<"save" | "delete" | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Problem | null>(null);
  const groups = useMemo(() => groupPermissions(catalog), [catalog]);

  const editable = id === undefined ? can("roles.create") : can("roles.update") && Boolean(role?.manageable);
  const rankValue = Number(rank);
  const rankValid = Number.isInteger(rankValue) && rankValue >= 1 && rankValue <= ceiling;
  const canCreateAny = ceiling >= 1;

  async function save() {
    setBusy(true); setError(null);
    const body = { name: name.trim(), description: description.trim() || null, authorityRank: rankValue, permissions: selected };
    try {
      if (id === undefined) { const created = await api.createRole(body); navigate(`/roluri/${created.role.id}`); }
      else { await api.updateRole(id, { ...body, status }); onSaved(); }
    } catch (caught) { setError(toProblem(caught)); }
    finally { setBusy(false); setConfirming(null); }
  }
  async function remove() {
    if (id === undefined) return;
    setBusy(true); setError(null);
    try { await api.deleteRole(id); navigate("/roluri"); }
    catch (caught) { setError(toProblem(caught)); setConfirming(null); setBusy(false); }
  }

  return (
    <div className="page">
      <button type="button" className="back-link" onClick={() => navigate("/roluri")}>{t.roleEditor.back}</button>
      <PageHeader title={id === undefined ? t.roleEditor.newTitle : role?.name ?? t.roleEditor.fallbackTitle} description={t.roleEditor.description}
        actions={editable && canCreateAny ? <div className="button-row">
          {id !== undefined && can("roles.delete") && <button type="button" className="button button-ghost" disabled={busy || (role?.userCount ?? 0) > 0} title={(role?.userCount ?? 0) > 0 ? t.roleEditor.stillAssigned : undefined} onClick={() => setConfirming("delete")}>{t.roleEditor.delete}</button>}
          <button type="button" className="button button-primary" disabled={busy || name.trim().length < 2 || !rankValid} onClick={() => setConfirming("save")}>{id === undefined ? t.roleEditor.create : t.common.save}</button>
        </div> : undefined} />
      {!editable && <Notice>{t.roleEditor.notEditable}</Notice>}
      {editable && !canCreateAny && <Notice>{t.roleEditor.cannotCreate}</Notice>}
      {saved && !error && <Notice tone="success">{t.notices.roleSaved}</Notice>}
      {error && <ErrorBanner error={error} />}
      <Card title={t.roleEditor.details}>
        <div className="form-grid">
          <Field label={t.roleEditor.name}>{(fid) => <input id={fid} disabled={!editable} value={name} onChange={(event) => setName(event.target.value)} />}</Field>
          <Field label={t.roleEditor.rank} hint={t.roleEditor.rankHint(ceiling)}>{(fid) => <input id={fid} type="number" min={1} max={ceiling} disabled={!editable} value={rank} aria-invalid={!rankValid} onChange={(event) => setRank(event.target.value)} />}</Field>
          <Field label={t.roleEditor.descriptionField}>{(fid) => <input id={fid} disabled={!editable} value={description} onChange={(event) => setDescription(event.target.value)} />}</Field>
          {id !== undefined && <Field label={t.roleEditor.status}>{(fid) => <select id={fid} disabled={!editable} value={status} onChange={(event) => setStatus(event.target.value as "active" | "inactive")}><option value="active">{t.status.active}</option><option value="inactive">{t.status.inactive}</option></select>}</Field>}
        </div>
      </Card>
      <div className="permission-groups">
        {groups.map((group) => (
          <Card key={group.category} title={category(group.category)}>
            <div className="check-list">
              {group.items.map((permission) => (
                <label key={permission.key} className={`check ${editable && permission.grantableByMe ? "" : "disabled"}`} title={permission.grantableByMe ? permissionDescription(permission.key, permission.description) : t.roleEditor.notGrantable}>
                  <input type="checkbox" disabled={!editable || !permission.grantableByMe} checked={selected.includes(permission.key)}
                    onChange={() => setSelected(selected.includes(permission.key) ? selected.filter((key) => key !== permission.key) : [...selected, permission.key])} />
                  {permissionLabel(permission.key, permission.label)} <small className="mono">{permission.key}</small>
                </label>
              ))}
            </div>
          </Card>
        ))}
      </div>
      {confirming === "save" && <ConfirmDialog title={id === undefined ? t.roleEditor.createTitle : t.roleEditor.saveTitle} confirmLabel={t.common.confirm} busy={busy} onCancel={() => setConfirming(null)} onConfirm={() => { void save(); }}>
        <p><strong>{name.trim()}</strong>{t.roleEditor.summary(rankValue, selected.length)}</p>
        {id !== undefined && <p>{t.roleEditor.appliesNext}</p>}
      </ConfirmDialog>}
      {confirming === "delete" && <ConfirmDialog title={t.roleEditor.deleteTitle} confirmLabel={t.common.delete} tone="danger" busy={busy} onCancel={() => setConfirming(null)} onConfirm={() => { void remove(); }}><p>{t.roleEditor.deleteBody}</p></ConfirmDialog>}
    </div>
  );
}

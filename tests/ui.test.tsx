import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { createApi } from "../src/api/client";
import type { EmployeeDetail, ManagementMe } from "../src/api/types";
import { DashboardContext } from "../src/app/context";
import { OneTimeSecret } from "../src/components/ui";
import { NoAccessPage } from "../src/pages/AuthPages";
import { EmployeeEditor, sameSet, toggle } from "../src/pages/EmployeeDetailPage";
import { groupPermissions, RoleEditor } from "../src/pages/RoleEditorPage";
import { API, employee, me, permission, role, root } from "./support";

const stages = [{ id: "material-preparation", ordinal: 1, label: "Pregătire material" }, { id: "sewing", ordinal: 2, label: "Confecționare" }];

function render(node: React.ReactNode, profile: ManagementMe = me()) {
  const permissions = new Set(profile.permissions);
  return renderToStaticMarkup(
    <DashboardContext.Provider value={{
      api: createApi(API, (() => Promise.reject(new Error("no network in render tests"))) as typeof fetch),
      session: { employee: { employeeUuid: profile.employee.id, displayName: profile.employee.displayName, username: profile.employee.username, department: profile.employee.department, positionTitle: null, permissions: profile.permissions, applications: profile.applications, allowedStageIds: [], isRoot: profile.isRoot, mustChangePassword: false, authorizationVersion: profile.authorizationVersion }, expiresAt: "2026-10-04T20:00:00Z" },
      me: profile,
      navigate: () => undefined,
      can: (key) => profile.isRoot || permissions.has(key),
    }}>{node}</DashboardContext.Provider>,
  );
}

function editor(data: EmployeeDetail, profile?: ManagementMe) {
  return render(<EmployeeEditor data={data} departments={[{ id: 2, key: "productie", name: "Producție", description: null, status: "active", parentId: null, employeeCount: 3, activeEmployeeCount: 3 }]}
    roles={[role(), role({ id: 6, key: "ceo", name: "CEO / Proprietar", authorityRank: 900, manageable: false })]} catalog={[permission()]} applicationKeys={["staff", "dashboard"]}
    stages={stages} managers={[]} busy={false} message="" error="" secret="" onPending={() => undefined} onSecret={() => undefined} />, profile);
}

const buttons = (html: string) => [...html.matchAll(/<button[^>]*>(.*?)<\/button>/g)].map((match) => match[1].replace(/<[^>]+>/g, ""));
const enabledCheckboxes = (html: string) => [...html.matchAll(/<input type="checkbox"([^>]*)>/g)].filter((match) => !match[1].includes("disabled")).length;

test("the protected root identity offers no functional modification controls, even to root", () => {
  for (const profile of [me(), me({ isRoot: true, authorityRank: null })]) {
    const html = editor(root(), profile);
    assert.match(html, /Administrator principal/);
    assert.match(html, /root-badge/);
    assert.match(html, /Cont de sistem protejat/);
    const labels = buttons(html);
    for (const forbidden of ["Dezactivează contul", "Activează contul", "Resetează parola", "Revizuiește accesul", "Revizuiește rolurile", "Revizuiește etapele", "Salvează profilul", "Salvează managerul"]) {
      assert.equal(labels.includes(forbidden), false, `${forbidden} must not be offered for root`);
    }
    assert.equal(enabledCheckboxes(html), 0, "no application, role or stage checkbox is usable on root");
    assert.doesNotMatch(html, /<input(?![^>]*disabled)[^>]*value="Administrator principal"/, "root profile fields are read-only");
  }
});

test("a manageable employee shows explicit review buttons instead of instant mutations", () => {
  const html = editor(employee());
  const labels = buttons(html);
  for (const expected of ["Revizuiește accesul", "Revizuiește rolurile", "Revizuiește etapele", "Dezactivează contul", "Resetează parola"]) assert.ok(labels.includes(expected), expected);
  assert.ok(enabledCheckboxes(html) > 0);
  // Roles above the actor's authority stay visible but cannot be ticked.
  assert.match(html, /<input type="checkbox" disabled=""[^>]*>CEO \/ Proprietar/);
});

test("an identity at or above the actor's authority, or the actor itself, is read-only", () => {
  const html = editor(employee({ manageable: false }));
  assert.equal(enabledCheckboxes(html), 0);
  assert.equal(buttons(html).some((label) => label.startsWith("Revizuiește") || label === "Dezactivează contul"), false);
  const self = editor(employee({ id: me().employee.id, manageable: false }));
  assert.match(self, /propriul tău cont/);
});

test("a temporary password is presented once with an intentional copy action and the required notice", () => {
  const html = renderToStaticMarkup(<OneTimeSecret label="Parolă temporară" value="Tmp-0123456789abcdef" />);
  assert.match(html, /Tmp-0123456789abcdef/);
  assert.match(html, /Parola temporară este afișată o singură dată\.<br\/>Utilizatorul va trebui să o schimbe la prima autentificare\./);
  assert.ok(buttons(html).includes("Copiază parola"));
});

test("an authenticated identity without Dashboard access sees the exact refusal and a logout", () => {
  const html = renderToStaticMarkup(<NoAccessPage displayName="Ion Popescu" onLogout={() => undefined} />);
  assert.match(html, /Nu ai acces la Panoul de control\./);
  assert.ok(buttons(html).includes("Ieși din cont"));
});

test("the role editor only offers server catalog permissions the actor can grant", () => {
  const catalog = [
    permission({ key: "employees.view", label: "Vizualizare angajați" }),
    permission({ key: "system.view", category: "system", label: "Vizualizare sistem", grantableByMe: false }),
    permission({ key: "dashboard.access", category: "dashboard", label: "Acces Dashboard", roleGrantable: false, grantableByMe: false }),
  ];
  assert.deepEqual(groupPermissions(catalog).flatMap((group) => group.items.map((item) => item.key)), ["employees.view", "system.view"], "never role-grantable permissions are not offered at all");
  const html = render(<RoleEditor existing={role({ id: 7, permissions: [] })} id={7} catalog={catalog} saved={false} onSaved={() => undefined} />, me({ permissions: [...me().permissions, "roles.update"] }));
  assert.match(html, /<input type="checkbox"[^>]*>Vizualizare angajați/);
  assert.doesNotMatch(html, /<input type="checkbox"(?![^>]*disabled)[^>]*>Vizualizare sistem/, "a permission the actor does not hold cannot be ticked");
  assert.doesNotMatch(html, /Acces Dashboard/);
  assert.doesNotMatch(html, /<input[^>]*type="text"[^>]*permission/i, "there is no free-text permission entry");
});

test("the role editor caps the authority rank below the actor's ceiling", () => {
  const html = render(<RoleEditor existing={null} catalog={[permission()]} saved={false} onSaved={() => undefined} />, me({ permissions: [...me().permissions, "roles.create"] }));
  assert.match(html, /max="699"/);
  assert.match(html, /Între 1 și 699/);
});

test("set helpers used by the review dialogs compare membership, not order", () => {
  assert.equal(sameSet(["staff", "dashboard"], ["dashboard", "staff"]), true);
  assert.equal(sameSet(["staff"], ["staff", "dashboard"]), false);
  assert.deepEqual(toggle(["staff"], "dashboard"), ["staff", "dashboard"]);
  assert.deepEqual(toggle(["staff", "dashboard"], "staff"), ["dashboard"]);
});

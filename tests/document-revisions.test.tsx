import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import type { ManagementMe } from "../src/api/types";
import { parseSse } from "../src/app/live";
import { parseRoute } from "../src/app/router";
import { NAVIGATION } from "../src/components/Shell";
import { I18nProvider } from "../src/i18n/context";
import { MESSAGES } from "../src/i18n";
import { ChangeTable } from "../src/pages/DocumentRevisionsPage";

const base: ManagementMe = {
  employee: { id: "s", username: "sinem", displayName: "Sinem", positionTitle: "Director Online", department: "Online" },
  isRoot: false, authorityRank: 450, grantablePermissions: [], applications: ["dashboard"], authorizationVersion: 1,
  permissions: ["dashboard.access", "orders.lookup_exact", "production.documents.approve_revision", "production.documents.view_history", "profile.view_self"],
  capabilities: { approveExceptions: false, approvalViaBackup: false, lookupOrders: true, manageOrganization: false, manageProductionSettings: false, cancelExceptions: false,
    approveDocumentRevisions: true, documentRevisionViaBackup: false, viewDocumentHistory: true, revokeDocuments: false },
};
const canFor = (me: ManagementMe) => (permission: string) => me.isRoot || me.permissions.includes(permission);
const visible = (me: ManagementMe) => NAVIGATION.filter((item) => item.visible(me, canFor(me))).map((item) => item.path);

test("the revision approver sees document revisions, not the operations approval pool", () => {
  assert.deepEqual(visible(base), ["/revizii-documente", "/revizii-documente/istoric", "/documente", "/cauta-comanda"]);
  const opsManager: ManagementMe = { ...base, permissions: ["dashboard.access", "orders.lookup_exact", "production.exceptions.approve"],
    capabilities: { ...base.capabilities!, approveExceptions: true, approveDocumentRevisions: false, viewDocumentHistory: false } };
  assert.deepEqual(visible(opsManager), ["/aprobari", "/aprobari/in-asteptare", "/aprobari/istoric", "/cauta-comanda"]);
  const backup: ManagementMe = { ...base, permissions: ["dashboard.access"], capabilities: { ...base.capabilities!, documentRevisionViaBackup: true, viewDocumentHistory: true, lookupOrders: false } };
  assert.deepEqual(visible(backup), ["/revizii-documente", "/revizii-documente/istoric", "/documente"]);
});

test("document routes are explicit and order ids stay source-aware", () => {
  assert.deepEqual(parseRoute("/revizii-documente"), { name: "document-revisions", view: "pending" });
  assert.deepEqual(parseRoute("/revizii-documente/istoric"), { name: "document-revisions", view: "history" });
  assert.deepEqual(parseRoute("/revizii-documente/cerere/11111111-1111-4111-8111-111111111111"), { name: "document-revision", id: "11111111-1111-4111-8111-111111111111" });
  assert.deepEqual(parseRoute("/revizii-documente/cerere/not-a-uuid"), { name: "not-found" });
  assert.deepEqual(parseRoute("/documente/trendhome%3A84521"), { name: "documents", id: "trendhome:84521" });
  assert.deepEqual(parseRoute("/documente"), { name: "documents" });
});

test("the production diff is a readable Romanian and Turkish table, never raw JSON", () => {
  const changes = [{ field: "line.meters", line: 1, before: "8 m", after: "10 m" }, { field: "customer.address", line: null, before: "Str. A 1", after: "Str. B 2" }];
  const ro = renderToStaticMarkup(<I18nProvider locale="ro"><ChangeTable changes={changes} /></I18nProvider>);
  assert.match(ro, /Metri \(linie\)/);
  assert.match(ro, /Linia 1/);
  assert.match(ro, /Adresă livrare/);
  assert.match(ro, /<strong>10 m<\/strong>/);
  assert.doesNotMatch(ro, /\{|"field"/);
  const tr = renderToStaticMarkup(<I18nProvider locale="tr"><ChangeTable changes={changes} /></I18nProvider>);
  assert.match(tr, /Metre \(satır\)/);
  assert.match(tr, /Teslimat adresi/);
  assert.deepEqual(Object.keys(MESSAGES.ro.documents.fields).sort(), Object.keys(MESSAGES.tr.documents.fields).sort());
});

test("live document events keep only identifiers", () => {
  const [frame] = parseSse('id: 9\nevent: document.revision_requested\ndata: {"orderId":"trendhome:84521","orderNumber":"84521","requestId":"r","revisionNumber":2,"status":"pending"}\n\n');
  assert.equal(frame.event, "document.revision_requested");
  assert.deepEqual(Object.keys(frame.data).sort(), ["orderId", "orderNumber", "requestId", "revisionNumber", "status"]);
});

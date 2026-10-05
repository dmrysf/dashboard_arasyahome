import assert from "node:assert/strict";
import { test } from "node:test";
import { renderToStaticMarkup } from "react-dom/server";
import { describeAuditEvent } from "../src/api/audit";
import { ApiError, createApi } from "../src/api/client";
import type { AuditEvent, ManagementMe } from "../src/api/types";
import { DashboardContext } from "../src/app/context";
import { Shell } from "../src/components/Shell";
import { OneTimeSecret, StatusBadge } from "../src/components/ui";
import { createTranslator, DEFAULT_LOCALE, initialLocale, MESSAGES, saveLocale, ValidationProblem, type Locale } from "../src/i18n";
import { I18nProvider } from "../src/i18n/context";
import { LOCALE_STORAGE_KEY, type LocaleStorage } from "../src/i18n/storage";
import { ChangePasswordPage, LoginPage, NoAccessPage } from "../src/pages/AuthPages";
import { DepartmentsPage } from "../src/pages/DepartmentsPage";
import { ApplicationsPage } from "../src/pages/ApplicationsPage";
import { AuditPage } from "../src/pages/AuditPage";
import { EmployeeEditor } from "../src/pages/EmployeeDetailPage";
import { EmployeesPage } from "../src/pages/EmployeesPage";
import { RoleEditor } from "../src/pages/RoleEditorPage";
import { RolesPage } from "../src/pages/RolesPage";
import { SystemPage } from "../src/pages/SystemPage";
import { API, employee, me, permission, role, root } from "./support";

function memoryStorage(initial: Record<string, string> = {}): LocaleStorage & { data: Record<string, string> } {
  const data = { ...initial };
  return { data, getItem: (key) => data[key] ?? null, setItem: (key, value) => { data[key] = value; } };
}

function render(locale: Locale, node: React.ReactNode, profile: ManagementMe = me({ permissions: [...me().permissions, "roles.update", "roles.create", "system.view", "departments.create", "departments.update", "employees.create"] })) {
  const permissions = new Set(profile.permissions);
  return renderToStaticMarkup(
    <I18nProvider locale={locale}>
      <DashboardContext.Provider value={{
        api: createApi(API, (() => Promise.reject(new Error("no network in render tests"))) as typeof fetch),
        session: { employee: { employeeUuid: profile.employee.id, displayName: profile.employee.displayName, username: profile.employee.username, department: profile.employee.department, positionTitle: null, permissions: profile.permissions, applications: profile.applications, allowedStageIds: [], isRoot: profile.isRoot, mustChangePassword: false, authorizationVersion: profile.authorizationVersion }, expiresAt: "2026-10-04T20:00:00Z" },
        me: profile,
        navigate: () => undefined,
        can: (key) => profile.isRoot || permissions.has(key),
      }}>{node}</DashboardContext.Provider>
    </I18nProvider>,
  );
}

const text = (html: string) => html.replace(/<[^>]+>/g, " ").replace(/&quot;/g, "\"").replace(/&#x27;/g, "'").replace(/&amp;/g, "&").replace(/\s+/g, " ");
const ROMANIAN_UI = /Angajați|Departament(e|ul)?\b|Roluri|Salvează|Anulează|Revizuiește|Parol[ăa]|Aplicații|Reîncearcă|Se încarcă|Ieși din cont|Funcție|Utilizator\b/;
const stages = [
  { id: "material-preparation", ordinal: 2, label: "Pregătire material" },
  { id: "quality-control", ordinal: 12, label: "Control calitate" },
];

function editor(locale: Locale, data = employee(), profile?: ManagementMe) {
  return render(locale, <EmployeeEditor data={data} departments={[{ id: 2, key: "productie", name: "Producție", description: null, status: "active", parentId: null, employeeCount: 3, activeEmployeeCount: 3 }]}
    roles={[role()]} catalog={[permission({ key: "employees.manage_stages", label: "Gestionare etape Staff" })]} applicationKeys={["staff", "dashboard"]}
    stages={stages} managers={[]} busy={false} message="employeeSaved" error={new ApiError("AUTHORITY_EXCEEDED", 403)} secret="" onPending={() => undefined} onSecret={() => undefined} />, profile);
}

/** Every leaf of a dictionary as "path: value"; functions are called with sample arguments. */
function leaves(value: unknown, prefix = ""): string[] {
  if (typeof value === "string") return [`${prefix}=${value}`];
  if (typeof value === "function") return [`${prefix}=${String((value as (...args: unknown[]) => unknown)("X", "Y"))}`];
  return Object.entries(value as Record<string, unknown>).flatMap(([key, child]) => leaves(child, prefix ? `${prefix}.${key}` : key));
}

test("1, 5: Romanian is the default; a missing, unknown or unreadable saved value falls back to Romanian", () => {
  assert.equal(DEFAULT_LOCALE, "ro");
  assert.equal(initialLocale(memoryStorage()), "ro");
  assert.equal(initialLocale(null), "ro");
  for (const bad of ["de", "", "TR", "tr-TR", "__proto__", "{\"locale\":\"tr\"}"]) assert.equal(initialLocale(memoryStorage({ [LOCALE_STORAGE_KEY]: bad })), "ro", bad);
  const throwing: LocaleStorage = { getItem: () => { throw new Error("blocked"); }, setItem: () => { throw new Error("blocked"); } };
  assert.equal(initialLocale(throwing), "ro");
  assert.doesNotThrow(() => saveLocale("tr", throwing));
});

test("2-4: the choice switches RO to TR and back and is remembered under one namespaced key only", () => {
  const storage = memoryStorage();
  saveLocale("tr", storage);
  assert.equal(initialLocale(storage), "tr");
  saveLocale("ro", storage);
  assert.equal(initialLocale(storage), "ro");
  assert.deepEqual(Object.keys(storage.data), ["arasya.dashboard.locale"]);
});

test("both locales provide every key; Turkish has no empty, unresolved or object text", () => {
  const ro = leaves(MESSAGES.ro).map((entry) => entry.split("=")[0]);
  const tr = leaves(MESSAGES.tr);
  assert.deepEqual(tr.map((entry) => entry.split("=")[0]), ro);
  for (const entry of tr) {
    const [key, value] = [entry.slice(0, entry.indexOf("=")), entry.slice(entry.indexOf("=") + 1)];
    assert.ok(value.trim(), key);
    assert.doesNotMatch(value, /undefined|\[object Object\]|NaN/, key);
  }
});

test("6: navigation and the shell are fully translated", () => {
  const raw = render("tr", <Shell pathname="/" onLogout={() => undefined}><p>body</p></Shell>, me({ isRoot: true, authorityRank: null }));
  const html = text(raw);
  for (const label of ["Yönetim Paneli", "Çalışanlar", "Roller ve Yetkiler", "Departmanlar", "Uygulamalar", "Denetim Kayıtları", "Sistem", "Çıkış yap", "Ana Yönetici"]) assert.match(html, new RegExp(label), label);
  assert.doesNotMatch(html, ROMANIAN_UI);
  assert.match(raw, /aria-label="RO — Română"/);
  assert.match(raw, /aria-label="TR — Türkçe"/);
  assert.match(raw, /role="group" aria-label="Arayüz dili"/);
  const ro = text(render("ro", <Shell pathname="/" onLogout={() => undefined}><p>body</p></Shell>, me({ isRoot: true, authorityRank: null })));
  for (const label of ["Panou de control", "Angajați", "Roluri și permisiuni", "Departamente", "Aplicații", "Audit", "Sistem", "Ieși din cont"]) assert.match(ro, new RegExp(label), label);
});

test("7, 16: the employee screen is translated, business values stay as stored, and root is the protected Ana Yönetici", () => {
  const html = text(editor("tr"));
  for (const label of ["Profil", "Uygulama Erişimleri", "Roller ve Yetkiler", "Staff Aşamaları", "Hiyerarşi", "Güvenlik", "Erişimi gözden geçir", "Hesabı Devre Dışı Bırak", "Malzeme Hazırlığı", "Kalite Kontrol", "Yönetim Paneli",
    "Değişiklik kaydedildi", "Bu işlem için gerekli yetki seviyesine sahip değilsiniz."]) assert.match(html, new RegExp(label), label);
  assert.match(html, /Producție/, "department names are business data");
  assert.match(html, /Ion Popescu/);
  assert.doesNotMatch(html, ROMANIAN_UI);
  const rootHtml = text(editor("tr", root(), me({ isRoot: true, authorityRank: null })));
  assert.match(rootHtml, /Ana Yönetici/);
  assert.match(rootHtml, /Korunan sistem hesabı\./);
  assert.doesNotMatch(rootHtml, /Hesabı Devre Dışı Bırak|Şifreyi sıfırla|Erişimi gözden geçir/, "root protections do not depend on the language");
  assert.match(rootHtml, /arasya\.root\.owner/, "the root username is never translated");
});

test("8, 20: roles and permissions are translated while stable keys are shown and kept unchanged", () => {
  const catalog = [permission({ key: "employees.manage_stages", label: "Gestionare etape Staff" }), permission({ key: "system.view", category: "system", label: "Vizualizare sistem" })];
  const html = text(render("tr", <RoleEditor id={7} existing={role({ id: 7, name: "Șef atelier", permissions: ["employees.manage_stages"] })} catalog={catalog} saved={false} onSaved={() => undefined} />));
  for (const label of ["Staff Aşamalarını Yönet", "employees.manage_stages", "Sistemi Görüntüle", "system.view", "Yetki Seviyesi", "Rol adı", "Ayrıntılar", "Çalışanlar", "Sistem"]) assert.match(html, new RegExp(label.replace(".", "\\.")), label);
  assert.match(html, /Șef atelier/, "role names are business data");
  assert.doesNotMatch(html, /Gestionare etape Staff|Vizualizare sistem/);
  const t = createTranslator("tr");
  assert.equal(t.permission("employees.manage_stages"), "Staff Aşamalarını Yönet");
  assert.equal(t.permission("future.permission", "Server label"), "Server label", "unknown keys keep the server text");
  const list = text(render("tr", <RolesPage />));
  assert.match(list, /Rol Oluştur/);
  assert.match(list, /Ana Yönetici bir rol değildir/);
});

test("B2B application and its permissions are localized in both languages, never shown with the server's Romanian label", () => {
  const b2b = [
    ["b2b.access", "applications", "Acces B2B"],
    ["b2b.companies.view", "b2b", "Vizualizare companii B2B"],
    ["b2b.companies.create", "b2b", "Creare companii B2B"],
    ["b2b.companies.update", "b2b", "Editare companii B2B"],
    ["b2b.companies.manage_status", "b2b", "Activare/dezactivare companii B2B"],
    ["b2b.orders.view", "b2b", "Vizualizare comenzi B2B"],
    ["b2b.orders.create", "b2b", "Creare comenzi B2B"],
    ["b2b.orders.update", "b2b", "Editare ciorne B2B"],
    ["b2b.orders.manage_status", "b2b", "Finalizare comenzi B2B"],
    ["b2b.accounts.view", "b2b", "Vizualizare conturi curente B2B"],
    ["b2b.accounts.record_payment", "b2b", "Înregistrare plăți B2B"],
    ["b2b.accounts.adjust", "b2b", "Ajustări cont curent B2B"],
    ["b2b.accounts.reverse", "b2b", "Stornare mișcări cont curent B2B"],
    ["b2b.accounts.export", "b2b", "Export extras de cont B2B"],
  ] as const;
  const catalog = b2b.filter(([key]) => key !== "b2b.access").map(([key, category, label]) => permission({ key, category, label }));
  const tr = text(render("tr", <RoleEditor id={9} existing={role({ id: 9, name: "Vânzări B2B", permissions: ["b2b.companies.view"] })} catalog={catalog} saved={false} onSaved={() => undefined} />));
  for (const label of ["B2B (toptan satış)", "B2B Şirketlerini Görüntüle", "B2B Şirketi Oluştur", "B2B Şirketlerini Düzenle", "B2B Şirketlerini Aktif/Pasif Yap", "b2b.companies.manage_status"]) assert.ok(tr.includes(label), label);
  assert.doesNotMatch(tr, /Vizualizare companii|Creare companii|Editare companii|Activare\/dezactivare/, "no Romanian server label inside the Turkish UI");
  const ro = text(render("ro", <RoleEditor id={9} existing={role({ id: 9, name: "Vânzări B2B", permissions: [] })} catalog={catalog} saved={false} onSaved={() => undefined} />));
  for (const label of ["B2B Siparişlerini Görüntüle", "B2B Siparişi Oluştur", "B2B Taslaklarını Düzenle", "B2B Sipariş Durumunu Yönet", "b2b.orders.manage_status"]) assert.ok(tr.includes(label), label);
  for (const label of ["Vizualizare comenzi B2B", "Creare comenzi B2B", "Editare ciorne B2B", "Finalizare/anulare comenzi B2B"]) assert.ok(ro.includes(label), label);
  for (const label of ["B2B Cari Hesapları Görüntüle", "B2B Ödeme Kaydet", "B2B Cari Hesap Düzeltmeleri", "B2B Cari Hareketlerini Ters Çevir", "B2B Hesap Ekstresi Dışa Aktar"]) assert.ok(tr.includes(label), label);
  for (const label of ["Vizualizare conturi curente B2B", "Înregistrare plăți B2B", "Ajustări cont curent B2B", "Stornare mișcări cont curent B2B", "Export extras de cont B2B"]) assert.ok(ro.includes(label), label);
  assert.ok(MESSAGES.ro.catalog.permissions["b2b.orders.manage_status"].description.includes("anulează"));
  assert.ok(MESSAGES.tr.catalog.permissions["b2b.orders.manage_status"].description.includes("iptal"));
  for (const label of ["B2B (vânzări en-gros)", "Vizualizare companii B2B", "Activare/dezactivare companii B2B"]) assert.ok(ro.includes(label), label);
  for (const locale of ["ro", "tr"] as const) {
    const t = createTranslator(locale);
    for (const [key, , serverLabel] of b2b) {
      assert.ok(Object.hasOwn(MESSAGES[locale].catalog.permissions, key), `${locale} ${key}`);
      if (locale === "tr") assert.notEqual(t.permission(key, serverLabel), serverLabel, key);
      assert.ok(t.permissionDescription(key, "server").length > 10);
    }
  }
  assert.equal(createTranslator("ro").applicationDescription("b2b", "Management vânzări en-gros"), "Aplicația internă pentru vânzări en-gros și clienți B2B");
  assert.equal(createTranslator("tr").applicationDescription("b2b", "Management vânzări en-gros"), "Toptan satış ve B2B müşteri yönetimi uygulaması");
  assert.doesNotMatch(JSON.stringify(MESSAGES), /parteneri B2B|iş ortakları/, "B2B is internal wholesale sales, not a partner portal");
});

test("9-14: departments, applications, audit, system, login and password change are translated", () => {
  const pages: Array<[string, React.ReactNode, string[]]> = [
    ["departments", <DepartmentsPage key="d" />, ["Departmanlar", "Yeni Departman", "Departman adı", "Üst departman", "Ekle"]],
    ["applications", <ApplicationsPage key="a" />, ["Uygulamalar", "Uygulama kaydı Ana Yönetici tarafından yönetilir"]],
    ["audit", <AuditPage key="u" />, ["Denetim Kayıtları", "Tüm işlemler", "Hesap devre dışı bırakıldı", "Başlangıç", "Bitiş", "Filtrele"]],
    ["system", <SystemPage key="s" />, ["Sistem", "Gizli bilgi"]],
    ["employees", <EmployeesPage key="e" />, ["Çalışanlar", "Yeni Çalışan", "Tüm durumlar", "Tüm departmanlar", "Ara"]],
  ];
  for (const [name, node, labels] of pages) {
    const html = text(render("tr", node));
    for (const label of labels) assert.match(html, new RegExp(label), `${name}: ${label}`);
    assert.doesNotMatch(html, ROMANIAN_UI, name);
  }
  const login = text(renderToStaticMarkup(<I18nProvider locale="tr"><LoginPage notice={new ApiError("SESSION_EXPIRED", 401)} onLogin={async () => undefined} /></I18nProvider>));
  for (const label of ["Giriş", "Kullanıcı adı", "Şifre", "Giriş yap", "Oturumunuzun süresi doldu"]) assert.match(login, new RegExp(label), label);
  const change = text(renderToStaticMarkup(<I18nProvider locale="tr"><ChangePasswordPage displayName="Ion" onChange={async () => undefined} onLogout={() => undefined} /></I18nProvider>));
  for (const label of ["Şifreyi değiştir", "Mevcut şifre", "Yeni şifre", "Yeni şifreyi doğrula", "Şifreyi kaydet", "Çıkış yap"]) assert.match(change, new RegExp(label), label);
  const denied = text(renderToStaticMarkup(<I18nProvider locale="tr"><NoAccessPage displayName="Ion" onLogout={() => undefined} /></I18nProvider>));
  assert.match(denied, /Yönetim Paneline erişim yetkiniz yok\./);
  for (const html of [login, change, denied]) assert.doesNotMatch(html, ROMANIAN_UI);
});

test("15: API and validation errors are translated from stable codes, never shown as server text", () => {
  const required = ["AUTHENTICATION_REQUIRED", "NO_SESSION", "APPLICATION_ACCESS_DENIED", "PASSWORD_CHANGE_REQUIRED", "CSRF_INVALID", "ORIGIN_DENIED", "AUTHORITY_EXCEEDED",
    "PERMISSION_NOT_GRANTABLE", "UNKNOWN_PERMISSION", "ROOT_PROTECTED", "SELF_MODIFICATION_DENIED", "DEPARTMENT_IN_USE", "ROLE_IN_USE", "INVALID_REQUEST"];
  for (const locale of ["ro", "tr"] as const) {
    const t = createTranslator(locale);
    const fallback = t.problem(new ApiError("SOMETHING_NEW", 400));
    for (const code of required) {
      const message = t.problem(new ApiError(code, 400, "Stack trace at /home/x/src/File.php:12"));
      assert.notEqual(message, fallback, `${locale} ${code}`);
      assert.doesNotMatch(message, /php|stack|trace/i);
    }
    assert.equal(t.problem(new Error("raw client failure")), fallback);
  }
  const tr = createTranslator("tr");
  assert.equal(tr.problem(new ApiError("ROOT_PROTECTED", 403)), "Ana Yönetici hesabı korumalıdır ve bu işlemle değiştirilemez.");
  assert.equal(tr.problem(new ApiError("AUTHORITY_EXCEEDED", 403)), "Bu işlem için gerekli yetki seviyesine sahip değilsiniz.");
  assert.match(tr.problem(new ApiError("DEPARTMENT_IN_USE", 409)), /Bu departmana bağlı kullanıcılar/);
  assert.equal(tr.problem(new ApiError("BRAND_NEW_FORBIDDEN", 403)), tr.problem(new ApiError("UNAUTHORIZED_ACTION", 403)));
  assert.equal(tr.problem(new ValidationProblem("loginMissing")), "Kullanıcı adını ve şifreyi girin.");
  assert.equal(createTranslator("ro").problem(new ValidationProblem("loginMissing")), "Completează utilizatorul și parola.");
});

test("stage labels: all 14 canonical stage IDs are localized; IDs themselves never change", () => {
  const ids = ["waiting", "material-preparation", "workshop-receiving", "labeling", "material-straightening", "bottom-hem", "side-hem", "ironing", "height", "header-tape", "sewing-finishing", "quality-control", "packing", "delivery"];
  assert.deepEqual(Object.keys(MESSAGES.ro.catalog.stages), ids);
  assert.deepEqual(Object.keys(MESSAGES.tr.catalog.stages), ids);
  const tr = createTranslator("tr");
  assert.equal(tr.stage("material-preparation"), "Malzeme Hazırlığı");
  assert.equal(tr.stage("delivery"), "Teslimat");
  assert.equal(createTranslator("ro").stage("material-preparation"), "Pregătire material");
  assert.equal(tr.stage("new-stage", "Etapă nouă"), "Etapă nouă", "an unknown stage keeps the API label");
  assert.equal(tr.stage("toString"), "toString", "object prototype names are not dictionary entries");
});

test("17: dates and numbers follow ro-RO and tr-TR while the API timestamp is untouched", () => {
  const stamp = "2026-10-04T10:00:00.000Z";
  assert.match(createTranslator("ro").dateTime(stamp), /^4 oct\. 2026/);
  assert.match(createTranslator("tr").dateTime(stamp), /^4 Eki 2026/);
  assert.equal(createTranslator("ro").number(12345), "12.345");
  assert.equal(createTranslator("tr").number(12345), "12.345");
  assert.equal(createTranslator("tr").dateTime(null), "—");
});

test("11: audit events render from stable action keys; stored names are not translated", () => {
  const event: AuditEvent = { id: "e", actorId: null, actorLabel: "Administrator principal (arasya.root.owner)", actorType: "root", action: "employee.deactivated", targetType: "employee", targetId: "t",
    targetLabel: "Ion Popescu (ion.popescu)", metadata: null, createdAt: "2026-10-04T10:00:00.000Z" };
  const frozen = Object.freeze({ ...event });
  assert.deepEqual(describeAuditEvent(frozen, createTranslator("tr")).sentences, ["Ana Yönetici, Ion Popescu adlı kullanıcıyı devre dışı bıraktı."]);
  assert.deepEqual(describeAuditEvent(frozen, createTranslator("ro")).sentences, ["Administrator principal a dezactivat utilizatorul Ion Popescu."]);
  const changed = describeAuditEvent({ ...event, actorType: "employee", actorLabel: "Maria Ionescu (maria.ionescu)", action: "employee.applications_changed", metadata: { before: [], after: ["dashboard"] } }, createTranslator("tr"));
  assert.deepEqual(changed.sentences, ["Ion Popescu adlı kullanıcıya Yönetim Paneli erişimi verildi."]);
  assert.equal(createTranslator("tr").auditAction("employee.deactivated"), "Hesap devre dışı bırakıldı");
  assert.deepEqual(event, frozen, "rendering never mutates the stored event");
});

test("18-19: status labels and the one-time password notice are centralized; the secret itself is shown as received", () => {
  assert.match(renderToStaticMarkup(<I18nProvider locale="tr"><StatusBadge status="inactive" /></I18nProvider>), />Pasif</);
  assert.match(renderToStaticMarkup(<I18nProvider locale="ro"><StatusBadge status="inactive" /></I18nProvider>), />Inactiv</);
  const html = renderToStaticMarkup(<I18nProvider locale="tr"><OneTimeSecret label="Geçici şifre" value="Tmp-0123456789abcdef" /></I18nProvider>);
  assert.match(html, /Tmp-0123456789abcdef/);
  assert.match(html, /Geçici şifre yalnızca bir kez gösterilir\.<br\/>Kullanıcının ilk girişinde şifresini değiştirmesi gerekir\./);
  assert.match(html, />Kopyala</);
});

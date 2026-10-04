import { ApiError } from "./client";

export const CATEGORY_LABELS: Record<string, string> = {
  dashboard: "Dashboard",
  employees: "Angajați",
  roles: "Roluri",
  departments: "Departamente",
  applications: "Aplicații",
  orders: "Comenzi",
  production: "Producție",
  activity: "Activitate",
  sources: "Surse",
  system: "Sistem",
  staff: "Staff (producție)",
};

export const CATEGORY_ORDER = ["dashboard", "employees", "roles", "departments", "applications", "orders", "production", "activity", "sources", "system", "staff"];

export const STATUS_LABELS: Record<string, string> = { active: "Activ", inactive: "Inactiv", suspended: "Suspendat" };

export const APPLICATION_LABELS: Record<string, string> = { staff: "Staff", dashboard: "Dashboard", b2b: "B2B", finance: "Financiar" };

export function applicationLabel(key: string): string {
  return APPLICATION_LABELS[key] ?? key;
}

export const AUDIT_ACTION_LABELS: Record<string, string> = {
  "employee.created": "Angajat creat",
  "employee.updated": "Profil modificat",
  "employee.activated": "Cont activat",
  "employee.deactivated": "Cont dezactivat",
  "employee.password_reset": "Parolă resetată",
  "employee.applications_changed": "Acces aplicații modificat",
  "employee.roles_changed": "Roluri modificate",
  "employee.stages_changed": "Etape Staff modificate",
  "employee.manager_changed": "Manager direct modificat",
  "role.created": "Rol creat",
  "role.updated": "Rol modificat",
  "role.deleted": "Rol șters",
  "department.created": "Departament creat",
  "department.updated": "Departament modificat",
  "department.deleted": "Departament șters",
  "root.bootstrapped": "Administrator principal creat",
  "root.password_recovered": "Parola administratorului principal recuperată",
};

export const TARGET_LABELS: Record<string, string> = { employee: "Angajat", role: "Rol", department: "Departament" };

const ERROR_MESSAGES: Record<string, string> = {
  AUTHENTICATION_REQUIRED: "Autentifică-te pentru a continua.",
  NO_SESSION: "Autentifică-te pentru a continua.",
  INVALID_CREDENTIALS: "Utilizatorul sau parola nu sunt corecte.",
  ACCOUNT_INACTIVE: "Contul nu este activ.",
  RATE_LIMITED: "Prea multe încercări. Încearcă din nou puțin mai târziu.",
  NETWORK_UNAVAILABLE: "Nu există conexiune cu serverul. Nicio modificare nu a fost salvată.",
  SESSION_EXPIRED: "Sesiunea a expirat. Autentifică-te din nou.",
  CSRF_INVALID: "Sesiunea de securitate s-a reînnoit. Reîncarcă pagina și încearcă din nou.",
  ORIGIN_DENIED: "Cererea nu provine dintr-o origine permisă.",
  UNAUTHORIZED_ACTION: "Nu ai permisiunea pentru această acțiune.",
  APPLICATION_ACCESS_DENIED: "Nu ai acces la Panoul de control.",
  CORS_HEADER_DENIED: "Cererea a fost respinsă de politica de securitate a serverului.",
  PASSWORD_CHANGE_REQUIRED: "Trebuie să schimbi parola temporară.",
  CURRENT_PASSWORD_INVALID: "Parola actuală nu este corectă.",
  PASSWORD_POLICY: "Parola nouă trebuie să aibă cel puțin 12 caractere, să fie diferită de cea actuală și să nu conțină numele de utilizator.",
  ROOT_PROTECTED: "Administratorul principal este un cont de sistem protejat și nu poate fi modificat.",
  AUTHORITY_EXCEEDED: "Modificarea depășește nivelul tău de autoritate.",
  SELF_MODIFICATION_DENIED: "Nu îți poți modifica propriile drepturi.",
  PERMISSION_NOT_GRANTABLE: "Una dintre permisiuni nu poate fi acordată de tine.",
  UNKNOWN_PERMISSION: "Permisiune necunoscută.",
  UNKNOWN_ROLE: "Rol necunoscut sau inactiv.",
  UNKNOWN_STAGE: "Etapă de producție necunoscută.",
  UNKNOWN_APPLICATION: "Aplicație necunoscută.",
  UNKNOWN_DEPARTMENT: "Departament necunoscut sau inactiv.",
  USERNAME_TAKEN: "Numele de utilizator este deja folosit.",
  INVALID_USERNAME: "Numele de utilizator poate conține litere, cifre, punct, cratimă și underscore (minimum 3 caractere).",
  DEPARTMENT_IN_USE: "Departamentul are încă angajați activi sau subdepartamente.",
  DEPARTMENT_CYCLE: "Structura departamentelor ar forma un ciclu.",
  ROLE_IN_USE: "Rolul este încă atribuit.",
  MANAGER_CYCLE: "Relația de raportare ar forma un ciclu.",
  MANAGER_NOT_FOUND: "Managerul ales nu există.",
  EMPLOYEE_NOT_FOUND: "Angajatul nu a fost găsit.",
  ROLE_NOT_FOUND: "Rolul nu a fost găsit.",
  DEPARTMENT_NOT_FOUND: "Departamentul nu a fost găsit.",
  INVALID_REQUEST: "Datele trimise nu sunt valide.",
  CONFLICT: "Modificarea intră în conflict cu datele existente.",
  SERVICE_UNAVAILABLE: "Serviciul nu este disponibil momentan.",
  WORKFLOW_UNAVAILABLE: "Fluxul de producție nu este disponibil momentan.",
  SERVER_ERROR: "Serverul nu a putut finaliza operațiunea. Nicio informație tehnică nu este afișată aici.",
  INTERNAL_ERROR: "Serverul nu a putut finaliza operațiunea. Nicio informație tehnică nu este afișată aici.",
  INVALID_RESPONSE: "Serverul a trimis un răspuns neașteptat. Reîncearcă.",
  NOT_FOUND: "Resursa cerută nu există.",
  METHOD_NOT_ALLOWED: "Operațiunea nu este permisă.",
  MALFORMED_JSON: "Datele trimise nu sunt valide.",
  REQUEST_TOO_LARGE: "Datele trimise sunt prea mari.",
  UNSUPPORTED_MEDIA_TYPE: "Datele trimise nu sunt valide.",
  INVALID_CURSOR: "Pagina cerută nu mai este validă. Reîncarcă lista.",
  INVALID_LIMIT: "Datele trimise nu sunt valide.",
};

/** Maps an API failure to a Romanian message. Server messages and stack traces are never shown. */
export function errorMessage(error: unknown): string {
  if (error instanceof ApiError) return ERROR_MESSAGES[error.code] ?? (error.status === 403 ? ERROR_MESSAGES.UNAUTHORIZED_ACTION : "Operațiunea nu a putut fi finalizată.");
  return "Operațiunea nu a putut fi finalizată.";
}

const dateTime = new Intl.DateTimeFormat("ro-RO", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Bucharest" });
export function formatDateTime(value: string | null): string {
  if (!value) return "—";
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? "—" : dateTime.format(parsed);
}

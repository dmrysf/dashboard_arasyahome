import { ApiError } from "../api/client";
import { ro, type Messages } from "./ro";
import { readLocalePreference, writeLocalePreference, type LocaleStorage } from "./storage";
import { tr } from "./tr";

export type { Messages } from "./ro";

/** Interface languages. Romanian is the default and the fallback; the browser language is never used. */
export const LOCALES = ["ro", "tr"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "ro";

export const MESSAGES: Record<Locale, Messages> = { ro, tr };
const INTL_LOCALE: Record<Locale, string> = { ro: "ro-RO", tr: "tr-TR" };

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

/** The saved choice, or Romanian when nothing (or anything unexpected) is stored. */
export function initialLocale(storage?: LocaleStorage | null): Locale {
  const saved = readLocalePreference(storage);
  return isLocale(saved) ? saved : DEFAULT_LOCALE;
}

export function saveLocale(locale: Locale, storage?: LocaleStorage | null): void {
  writeLocalePreference(locale, storage);
}

export type ValidationKey = keyof Messages["validation"];
export type NoticeKey = keyof Messages["notices"];

/** A form check that failed before anything was sent; rendered in the active language. */
export class ValidationProblem extends Error {
  constructor(public readonly key: ValidationKey) {
    super(key);
    this.name = "ValidationProblem";
  }
}

/**
 * Failures are kept as codes, not text, so an open error follows a language switch. Anything that is not a
 * known API or validation failure becomes a generic client error; its own message is never shown.
 */
export type Problem = ApiError | ValidationProblem;

export function toProblem(caught: unknown): Problem {
  return caught instanceof ApiError || caught instanceof ValidationProblem ? caught : new ApiError("CLIENT_ERROR", 0);
}

/** Permission categories in a stable, readable order; the keys come from the server catalog. */
export const CATEGORY_ORDER = ["dashboard", "employees", "roles", "departments", "applications", "orders", "production", "activity", "sources", "system", "staff"];

function pick<T>(map: Record<string, T>, key: string): T | undefined {
  return Object.hasOwn(map, key) ? map[key] : undefined;
}

export type Translator = {
  locale: Locale;
  t: Messages;
  /** Human message for a failure. Server text and stack traces are never shown. */
  problem: (error: unknown) => string;
  dateTime: (value: string | null) => string;
  number: (value: number) => string;
  /** Known system catalogs are labelled by their stable key; unknown keys keep the server's own text. */
  application: (key: string, fallback?: string) => string;
  applicationOption: (key: string, fallback?: string) => string;
  applicationDescription: (key: string, fallback: string | null) => string;
  permission: (key: string, fallback?: string) => string;
  permissionDescription: (key: string, fallback?: string) => string;
  category: (key: string) => string;
  stage: (id: string, fallback?: string) => string;
  status: (value: string) => string;
  auditAction: (action: string) => string;
};

export function createTranslator(locale: Locale): Translator {
  const t = MESSAGES[locale];
  const errors: Record<string, string> = t.errors;
  const dateTime = new Intl.DateTimeFormat(INTL_LOCALE[locale], { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Bucharest" });
  const number = new Intl.NumberFormat(INTL_LOCALE[locale]);
  const app = (key: string) => pick(t.catalog.applications, key);
  const permission = (key: string) => pick(t.catalog.permissions, key);
  return {
    locale,
    t,
    problem: (error) => {
      if (error instanceof ValidationProblem) return t.validation[error.key];
      if (error instanceof ApiError) return pick(errors, error.code) ?? (error.status === 403 ? t.errors.UNAUTHORIZED_ACTION : t.errors.fallback);
      return t.errors.fallback;
    },
    dateTime: (value) => {
      if (!value) return "—";
      const parsed = new Date(value);
      return Number.isNaN(parsed.getTime()) ? "—" : dateTime.format(parsed);
    },
    number: (value) => number.format(value),
    application: (key, fallback) => app(key)?.name ?? fallback ?? key,
    applicationOption: (key, fallback) => app(key)?.option ?? fallback ?? key,
    applicationDescription: (key, fallback) => app(key)?.description ?? fallback ?? "—",
    permission: (key, fallback) => permission(key)?.label ?? fallback ?? key,
    permissionDescription: (key, fallback) => permission(key)?.description ?? fallback ?? "",
    category: (key) => pick(t.catalog.categories, key) ?? key,
    stage: (id, fallback) => pick(t.catalog.stages, id) ?? fallback ?? id,
    status: (value) => pick<string>(t.status, value) ?? value,
    auditAction: (action) => pick(t.auditActions, action) ?? t.audit.fallbackAction,
  };
}

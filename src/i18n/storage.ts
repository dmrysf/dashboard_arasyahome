/**
 * The only browser-storage access in the Dashboard. It holds the interface language and nothing else: never a
 * session, token, password or permission. Storage can be unavailable (private mode, blocked site data), so every
 * access is guarded and the Dashboard falls back to Romanian.
 */
export const LOCALE_STORAGE_KEY = "arasya.dashboard.locale";

export type LocaleStorage = Pick<Storage, "getItem" | "setItem">;

function browserStorage(): LocaleStorage | null {
  try { return typeof window === "undefined" ? null : window.localStorage; } catch { return null; }
}

export function readLocalePreference(storage: LocaleStorage | null = browserStorage()): string | null {
  try { return storage?.getItem(LOCALE_STORAGE_KEY) ?? null; } catch { return null; }
}

export function writeLocalePreference(value: string, storage: LocaleStorage | null = browserStorage()): void {
  try { storage?.setItem(LOCALE_STORAGE_KEY, value); } catch { /* the choice still applies for this visit */ }
}

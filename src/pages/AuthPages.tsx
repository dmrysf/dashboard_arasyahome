import { useId, useState, type FormEvent } from "react";
import type { ValidationKey } from "../i18n";
import { toProblem, ValidationProblem, type Problem } from "../i18n";
import { useI18n } from "../i18n/context";
import { ErrorText, LocaleSwitcher } from "../components/ui";

function AuthFrame({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  const { t } = useI18n();
  return (
    <main className="auth-page">
      <div className="auth-panel">
        <div className="auth-top">
          <div className="auth-brand"><span className="brand-mark">A</span><div><strong>Arasya</strong><span>{t.brand.product}</span></div></div>
          <LocaleSwitcher />
        </div>
        <h1>{title}</h1>
        <p className="auth-subtitle">{subtitle}</p>
        {children}
      </div>
      <p className="auth-footnote">{t.auth.footnote}</p>
    </main>
  );
}

export function LoginPage({ notice, onLogin }: { notice?: Problem; onLogin: (username: string, password: string) => Promise<void> }) {
  const { t, problem } = useI18n();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Problem | null>(null);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (!username.trim() || !password) { setError(new ValidationProblem("loginMissing")); return; }
    setBusy(true); setError(null);
    try { await onLogin(username.trim(), password); }
    catch (caught) { setError(toProblem(caught)); setPassword(""); setBusy(false); }
  }
  return (
    <AuthFrame title={t.auth.loginTitle} subtitle={t.auth.loginSubtitle}>
      <form className="auth-form" onSubmit={submit} noValidate>
        {notice && <div className="notice notice-info" role="status">{problem(notice)}</div>}
        <label htmlFor="login-username">{t.auth.username}</label>
        <input id="login-username" autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} />
        <PasswordField label={t.auth.password} field={t.auth.fieldPassword} value={password} onChange={setPassword} autoComplete="current-password" />
        {error && <ErrorText error={error} />}
        <button className="button button-primary button-block" type="submit" disabled={busy}>{busy ? t.auth.loggingIn : t.auth.login}</button>
      </form>
    </AuthFrame>
  );
}

/** One password input with its own Show/Hide control; the control's name never repeats the field label. */
export function PasswordField({ label, field, value, onChange, autoComplete }: { label: string; field: string; value: string; onChange: (value: string) => void; autoComplete: "current-password" | "new-password" }) {
  const { t } = useI18n();
  const id = useId();
  const [visible, setVisible] = useState(false);
  return (
    <>
      <label htmlFor={id}>{label}</label>
      <div className="password-input">
        <input id={id} type={visible ? "text" : "password"} autoComplete={autoComplete} autoCapitalize="none" autoCorrect="off" spellCheck={false} value={value} onChange={(event) => onChange(event.target.value)} />
        <button type="button" className="password-toggle" aria-controls={id} aria-pressed={visible} aria-label={t.auth.toggle(visible, field)} onClick={() => setVisible((current) => !current)}>{visible ? t.auth.hide : t.auth.show}</button>
      </div>
    </>
  );
}

/** Client-side checks; the server enforces the same policy and stays the authority. */
export function passwordProblem(current: string, next: string, confirmation: string, username: string): ValidationKey | null {
  if (!current || !next || !confirmation) return "passwordMissing";
  if (next.length < 12) return "passwordTooShort";
  if (next === current) return "passwordSame";
  if (username && next.toLowerCase().includes(username.toLowerCase())) return "passwordContainsUsername";
  if (next !== confirmation) return "passwordMismatch";
  return null;
}

/** The forced first-login (or post-reset) change, and the voluntary change from the account area. */
export function ChangePasswordPage({ displayName, username, voluntary = false, onChange, onLogout, onCancel }: { displayName: string; username: string; voluntary?: boolean; onChange: (current: string, next: string) => Promise<void>; onLogout: () => void; onCancel?: () => void }) {
  const { t } = useI18n();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Problem | null>(null);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    const problem = passwordProblem(current, next, confirmation, username);
    if (problem) { setError(new ValidationProblem(problem)); return; }
    setBusy(true); setError(null);
    try { await onChange(current, next); }
    catch (caught) { setError(toProblem(caught)); setBusy(false); }
  }
  return (
    <AuthFrame title={voluntary ? t.auth.changeTitle : t.auth.forcedTitle} subtitle={voluntary ? t.auth.voluntarySubtitle(displayName) : t.auth.changeSubtitle(displayName)}>
      <form className="auth-form" onSubmit={submit} noValidate>
        {!voluntary && <div className="password-required" role="note"><strong>{t.auth.requiredTitle}</strong><span>{t.auth.requiredBody}</span></div>}
        <PasswordField label={voluntary ? t.auth.currentPassword : t.auth.currentTemporaryPassword} field={t.auth.fieldCurrent} value={current} onChange={setCurrent} autoComplete="current-password" />
        <PasswordField label={t.auth.newPassword} field={t.auth.fieldNew} value={next} onChange={setNext} autoComplete="new-password" />
        <PasswordField label={t.auth.confirmPassword} field={t.auth.fieldConfirm} value={confirmation} onChange={setConfirmation} autoComplete="new-password" />
        <small className="hint">{t.auth.passwordHint}</small>
        {error && <ErrorText error={error} />}
        <button className="button button-primary button-block" type="submit" disabled={busy}>{busy ? t.common.saving : t.auth.savePassword}</button>
        {voluntary && onCancel
          ? <button className="button button-ghost button-block" type="button" onClick={onCancel}>{t.common.cancel}</button>
          : <button className="button button-ghost button-block" type="button" onClick={onLogout}>{t.common.logout}</button>}
      </form>
    </AuthFrame>
  );
}

export function NoAccessPage({ displayName, onLogout }: { displayName: string; onLogout: () => void }) {
  const { t } = useI18n();
  return (
    <AuthFrame title={t.auth.noAccessTitle} subtitle={t.auth.noAccessSubtitle(displayName)}>
      <button className="button button-secondary button-block" type="button" onClick={onLogout}>{t.common.logout}</button>
    </AuthFrame>
  );
}

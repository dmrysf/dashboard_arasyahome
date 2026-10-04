import { useState, type FormEvent } from "react";
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
        <label htmlFor="login-password">{t.auth.password}</label>
        <input id="login-password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} />
        {error && <ErrorText error={error} />}
        <button className="button button-primary button-block" type="submit" disabled={busy}>{busy ? t.auth.loggingIn : t.auth.login}</button>
      </form>
    </AuthFrame>
  );
}

export function ChangePasswordPage({ displayName, onChange, onLogout }: { displayName: string; onChange: (current: string, next: string) => Promise<void>; onLogout: () => void }) {
  const { t } = useI18n();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<Problem | null>(null);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (next.length < 12) { setError(new ValidationProblem("passwordTooShort")); return; }
    if (next !== confirmation) { setError(new ValidationProblem("passwordMismatch")); return; }
    setBusy(true); setError(null);
    try { await onChange(current, next); }
    catch (caught) { setError(toProblem(caught)); setBusy(false); }
  }
  return (
    <AuthFrame title={t.auth.changeTitle} subtitle={t.auth.changeSubtitle(displayName)}>
      <form className="auth-form" onSubmit={submit} noValidate>
        <label htmlFor="pw-current">{t.auth.currentPassword}</label>
        <input id="pw-current" type="password" autoComplete="current-password" value={current} onChange={(event) => setCurrent(event.target.value)} />
        <label htmlFor="pw-new">{t.auth.newPassword}</label>
        <input id="pw-new" type="password" autoComplete="new-password" value={next} onChange={(event) => setNext(event.target.value)} />
        <label htmlFor="pw-confirm">{t.auth.confirmPassword}</label>
        <input id="pw-confirm" type="password" autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} />
        <small className="hint">{t.auth.passwordHint}</small>
        {error && <ErrorText error={error} />}
        <button className="button button-primary button-block" type="submit" disabled={busy}>{busy ? t.common.saving : t.auth.savePassword}</button>
        <button className="button button-ghost button-block" type="button" onClick={onLogout}>{t.common.logout}</button>
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

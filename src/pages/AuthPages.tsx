import { useState, type FormEvent } from "react";
import { errorMessage } from "../api/labels";

function AuthFrame({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return (
    <main className="auth-page">
      <div className="auth-panel">
        <div className="auth-brand"><span className="brand-mark">A</span><div><strong>Arasya</strong><span>Panou de control</span></div></div>
        <h1>{title}</h1>
        <p className="auth-subtitle">{subtitle}</p>
        {children}
      </div>
      <p className="auth-footnote">Aplicație internă · acces doar pentru conturile autorizate</p>
    </main>
  );
}

export function LoginPage({ notice, onLogin }: { notice?: string; onLogin: (username: string, password: string) => Promise<void> }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (!username.trim() || !password) { setError("Completează utilizatorul și parola."); return; }
    setBusy(true); setError("");
    try { await onLogin(username.trim(), password); }
    catch (caught) { setError(errorMessage(caught)); setPassword(""); setBusy(false); }
  }
  return (
    <AuthFrame title="Autentificare" subtitle="Folosește contul central Arasya.">
      <form className="auth-form" onSubmit={submit} noValidate>
        {notice && <div className="notice notice-info" role="status">{notice}</div>}
        <label htmlFor="login-username">Nume utilizator</label>
        <input id="login-username" autoComplete="username" value={username} onChange={(event) => setUsername(event.target.value)} />
        <label htmlFor="login-password">Parolă</label>
        <input id="login-password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} />
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="button button-primary button-block" type="submit" disabled={busy}>{busy ? "Se verifică…" : "Intră în cont"}</button>
      </form>
    </AuthFrame>
  );
}

export function ChangePasswordPage({ displayName, onChange, onLogout }: { displayName: string; onChange: (current: string, next: string) => Promise<void>; onLogout: () => void }) {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    if (next.length < 12) { setError("Parola nouă trebuie să aibă cel puțin 12 caractere."); return; }
    if (next !== confirmation) { setError("Confirmarea nu coincide cu parola nouă."); return; }
    setBusy(true); setError("");
    try { await onChange(current, next); }
    catch (caught) { setError(errorMessage(caught)); setBusy(false); }
  }
  return (
    <AuthFrame title="Schimbă parola" subtitle={`${displayName}, contul folosește o parolă temporară. Alege o parolă nouă înainte de a continua.`}>
      <form className="auth-form" onSubmit={submit} noValidate>
        <label htmlFor="pw-current">Parola actuală</label>
        <input id="pw-current" type="password" autoComplete="current-password" value={current} onChange={(event) => setCurrent(event.target.value)} />
        <label htmlFor="pw-new">Parola nouă</label>
        <input id="pw-new" type="password" autoComplete="new-password" value={next} onChange={(event) => setNext(event.target.value)} />
        <label htmlFor="pw-confirm">Confirmă parola nouă</label>
        <input id="pw-confirm" type="password" autoComplete="new-password" value={confirmation} onChange={(event) => setConfirmation(event.target.value)} />
        <small className="hint">Minimum 12 caractere, diferită de parola actuală și fără numele de utilizator. După schimbare, celelalte sesiuni sunt închise.</small>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="button button-primary button-block" type="submit" disabled={busy}>{busy ? "Se salvează…" : "Salvează parola"}</button>
        <button className="button button-ghost button-block" type="button" onClick={onLogout}>Ieși din cont</button>
      </form>
    </AuthFrame>
  );
}

export function NoAccessPage({ displayName, onLogout }: { displayName: string; onLogout: () => void }) {
  return (
    <AuthFrame title="Nu ai acces la Panoul de control." subtitle={`${displayName}, contul tău este valid, dar nu are acces la această aplicație. Contactează administratorul dacă ai nevoie de acces.`}>
      <button className="button button-secondary button-block" type="button" onClick={onLogout}>Ieși din cont</button>
    </AuthFrame>
  );
}

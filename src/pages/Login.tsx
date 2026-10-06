import { useState } from 'react';
import { ArrowRight, Eye, EyeOff, LockKeyhole, Package, ShieldCheck } from 'lucide-react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { database } from '../lib/supabase';
import { errorMessage } from '../lib/errors';
import { Loading } from '../components/States';

export function Login() {
  const { session, loading } = useAuth();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  if (loading) return <Loading label="Ověřování přihlášení…" />;
  if (session) return <Navigate to="/administrace" replace />;

  async function submit(email: string, password: string) {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const { error: authError } = await database().auth.signInWithPassword({ email: email.trim(), password });
      if (authError) throw authError;
    } catch (err) { setError(errorMessage(err)); }
    finally { setBusy(false); }
  }

  return <LoginView onSubmit={submit} busy={busy} error={error} />;
}

// Stejnou přihlašovací stránku lze zobrazit i před konfigurací, bez falešné session.
export function LoginView({ onSubmit, busy = false, error = null }: { onSubmit?: (email: string, password: string) => Promise<void>; busy?: boolean; error?: string | null }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const disabled = busy || !onSubmit;

  return <main className="login-page">
    <section className="login-story">
      <div className="brand"><span className="brand-mark"><Package size={26} /></span><span className="brand-name"><span className="brand-company">Sebimoto</span><span>expedice<span className="brand-dot">.</span></span></span></div>
      <div className="login-story-content"><span className="eyebrow">PŘEHLED V KAŽDÉM KROKU</span><h1>Každá zakázka.<br />Včas na cestě.</h1><p>Jedno místo pro váš sklad. Jasné priority, přehledné zakázky a expedice pod kontrolou.</p><div className="story-grid"><div><span>01</span><strong>Zadejte zakázku</strong></div><div><span>02</span><strong>Sledujte termín</strong></div><div><span>03</span><strong>Potvrďte odeslání</strong></div></div></div>
      <p className="login-story-footer"><ShieldCheck size={18} />Interní pracovní systém</p>
    </section>
    <section className="login-form-section">
      <div className="login-card"><div className="login-lock"><LockKeyhole size={25} /></div><h2>Vítejte zpět</h2><p className="muted">Přihlaste se ke správě skladových zakázek.</p>
        <form onSubmit={event => { event.preventDefault(); if (onSubmit && !busy) void onSubmit(email, password); }} className="form-stack">
          <label>E-mail<input type="email" autoComplete="username" required maxLength={254} value={email} onChange={event => setEmail(event.target.value)} placeholder="vas@email.cz" disabled={disabled} /></label>
          <label>Heslo<div className="password-field"><input type={showPassword ? 'text' : 'password'} autoComplete="current-password" required value={password} onChange={event => setPassword(event.target.value)} disabled={disabled} /><button type="button" className="icon-button" aria-label={showPassword ? 'Skrýt heslo' : 'Zobrazit heslo'} disabled={!onSubmit} onClick={() => setShowPassword(value => !value)}>{showPassword ? <EyeOff size={20} /> : <Eye size={20} />}</button></div></label>
          {error && <p className="inline-error" role="alert">{error}</p>}
          <button className="button primary login-submit" disabled={disabled}>{busy ? 'Přihlašování…' : 'Přihlásit se'}<ArrowRight size={20} /></button>
        </form>
        <p className="login-help">Nemáte přístup nebo jste zapomněli heslo?<br />Obraťte se na správce systému.</p>
      </div>
      <p className="login-footer">Sebimoto expedice · Správa skladových zakázek</p>
    </section>
  </main>;
}

import { useState } from 'react';
import { Archive, ArrowUpRight, Check, LayoutDashboard, LogOut, Moon, RefreshCw, Settings2, Sun, Wifi, WifiOff } from 'lucide-react';
import { Brand } from './Brand';
import { NavLink, Outlet } from 'react-router-dom';
import { useAuth } from '../auth/AuthProvider';
import { useOrders } from '../data/OrdersProvider';
import { useToast } from './Toast';
import { errorMessage } from '../lib/errors';
import { useNow } from '../hooks/useNow';
import { formatDate, stats } from '../lib/orders';

export function Layout() {
  const { profile, session, signOut } = useAuth();
  const { orders, refreshing, error, realtime, lastUpdated, reload } = useOrders();
  const now = useNow();
  const counts = stats(orders, now);
  const notify = useToast();
  const [signingOut, setSigningOut] = useState(false);
  const [dark, setDark] = useState(document.documentElement.dataset.theme === 'dark');
  const toggleTheme = () => {
    const next = !dark;
    setDark(next);
    document.documentElement.dataset.theme = next ? 'dark' : 'light';
    try { localStorage.setItem('expedice-theme', next ? 'dark' : 'light'); } catch { /* Úložiště může být zakázané. */ }
  };
  async function logout() {
    setSigningOut(true);
    try { await signOut(); } catch (err) { notify(errorMessage(err), 'error'); setSigningOut(false); }
  }

  return <div className="app-layout">
    <a className="skip-link" href="#main">Přeskočit na obsah</a>
    <aside className="sidebar">
      <NavLink to="/administrace" className="brand"><Brand /></NavLink>
      <div className="workspace-tag"><span className="status-dot" />SKLADOVÝ SYSTÉM</div>
      <nav aria-label="Hlavní navigace" className="main-nav">
        <NavLink to="/sklad"><LayoutDashboard size={21} /><span>Přehled skladu</span><span className="nav-count">{counts.pending}</span></NavLink>
        <NavLink to="/administrace"><Settings2 size={21} /><span>Administrace</span></NavLink>
        <NavLink to="/historie"><Archive size={21} /><span>Historie odeslání</span></NavLink>
      </nav>
      <div className="sidebar-note"><div className="sidebar-note-icon"><ArrowUpRight size={24} /></div><strong>Včas je nejlepší čas.</strong><p>Zakázky expedujeme nejpozději do 14 dní od vytvoření.</p></div>
      <div className="sidebar-bottom"><button className="theme-button" onClick={toggleTheme}>{dark ? <Sun size={19} /> : <Moon size={19} />}{dark ? 'Světlý režim' : 'Tmavý režim'}</button><div className="user-profile"><div className="avatar">{profile?.display_name.trim().slice(0, 2).toLocaleUpperCase('cs')}</div><div><strong>{profile?.display_name}</strong><span>Tým skladu</span></div><button className="icon-button" title="Odhlásit se" aria-label="Odhlásit se" disabled={signingOut} onClick={() => void logout()}><LogOut size={19} /></button></div></div>
    </aside>
    <div className="main-column">
      <header className="topbar"><div className="topbar-greeting"><span className="muted">Pracovní prostor</span><strong>Správa expedice</strong></div><div className="topbar-actions"><time dateTime={new Date(now).toISOString()}>{formatDate(new Date(now).toISOString())}</time><button className="icon-button mobile-theme" onClick={toggleTheme} aria-label={dark ? 'Zapnout světlý režim' : 'Zapnout tmavý režim'}>{dark ? <Sun size={20} /> : <Moon size={20} />}</button><span className="role-chip">PLNÝ PŘÍSTUP</span></div></header>
      <main id="main" className="main-content"><Outlet /></main>
      <footer className="app-footer"><span className={error ? 'sync-status sync-error' : 'sync-status'}>{error ? <WifiOff size={15} /> : realtime === 'live' ? <Wifi size={15} /> : <Check size={15} />}{error ? 'Údaje se nepodařilo obnovit' : realtime === 'live' ? 'Živé aktualizace zapnuté' : 'Automatické obnovení každých 30 s'}{lastUpdated && !error && <span className="updated-time"> · {new Date(lastUpdated).toLocaleTimeString('cs-CZ', { hour: '2-digit', minute: '2-digit' })}</span>}</span><button className="text-button" disabled={refreshing} onClick={() => void reload()}><RefreshCw size={14} className={refreshing ? 'spin' : ''} />{refreshing ? 'Obnovování…' : 'Obnovit'}</button><span className="footer-account" title={session?.user.email}>{session?.user.email}</span></footer>
    </div>
  </div>;
}

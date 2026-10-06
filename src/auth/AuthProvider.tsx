import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { database } from '../lib/supabase';
import { errorMessage } from '../lib/errors';
import type { Profile } from '../types';

interface AuthState {
  session: Session | null;
  profile: Profile | null;
  loading: boolean;
  error: string | null;
  reloadProfile: () => Promise<void>;
  signOut: () => Promise<void>;
}
const AuthContext = createContext<AuthState | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [profile, setProfile] = useState<Profile | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const generation = useRef(0);
  const userId = useRef<string | null>(null);
  const currentSession = useRef<Session | null>(null);

  const fetchProfile = useCallback(async (id: string, blocking = false) => {
    const request = ++generation.current;
    if (blocking) { setLoading(true); setError(null); }
    try {
      const { data, error: dbError } = await database().from('profiles').select('*').eq('id', id).maybeSingle();
      if (request !== generation.current) return;
      if (dbError) throw dbError;
      if (!data || !data.is_active) {
        setProfile(null);
        setError(data ? 'Váš účet je deaktivovaný. Obraťte se na správce.' : 'Uživatelský profil ještě není připravený. Správce musí spustit migraci 202610060002_shared_access.sql; ta doplní profily automaticky.');
      } else { setProfile(data); setError(null); }
    } catch (err) {
      if (request === generation.current) { setProfile(null); setError(errorMessage(err)); }
    } finally {
      if (request === generation.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    // Callback nepouští další Supabase požadavky synchronně uvnitř auth zámku.
    const { data: { subscription } } = database().auth.onAuthStateChange((_event, next) => {
      if (!active) return;
      currentSession.current = next;
      setSession(next);
      const nextId = next?.user.id ?? null;
      if (nextId === userId.current && _event !== 'INITIAL_SESSION') return;
      userId.current = nextId;
      ++generation.current;
      setProfile(null);
      setError(null);
      if (!nextId) { setLoading(false); return; }
      setLoading(true);
      setTimeout(() => { if (active && userId.current === nextId) void fetchProfile(nextId, true); }, 0);
    });
    return () => { active = false; ++generation.current; subscription.unsubscribe(); };
  }, [fetchProfile]);

  const reloadProfile = useCallback(async () => {
    const id = currentSession.current?.user.id;
    if (id) await fetchProfile(id);
  }, [fetchProfile]);

  useEffect(() => {
    if (!session?.user.id) return;
    const channel = database().channel(`my-profile-${session.user.id}`).on('postgres_changes', { event: '*', schema: 'public', table: 'profiles', filter: `id=eq.${session.user.id}` }, () => { void reloadProfile(); }).subscribe();
    const interval = setInterval(() => { void reloadProfile(); }, 5 * 60_000);
    const focus = () => { void reloadProfile(); };
    window.addEventListener('focus', focus);
    return () => { void database().removeChannel(channel); clearInterval(interval); window.removeEventListener('focus', focus); };
  }, [session?.user.id, reloadProfile]);

  const signOut = useCallback(async () => {
    const { error: signOutError } = await database().auth.signOut({ scope: 'local' });
    if (signOutError) throw signOutError;
    // Event SIGNED_OUT vymaže state a chráněné komponenty včetně dat.
  }, []);

  return <AuthContext.Provider value={{ session, profile, loading, error, reloadProfile, signOut }}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('AuthProvider nebyl inicializován.');
  return context;
}

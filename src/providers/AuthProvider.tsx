import { createContext, useContext, useEffect, useState, type PropsWithChildren } from 'react';
import { AppState } from 'react-native';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '../lib/supabase';

const AuthContext = createContext<{
  session: Session | null;
  loading: boolean;
  error: string | null;
}>({ session: null, loading: true, error: null });
export function AuthProvider({ children }: PropsWithChildren) {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(Boolean(supabase));
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    const client = supabase;
    if (!client) return;
    let active = true;
    let eventReceived = false;
    const {
      data: { subscription },
    } = client.auth.onAuthStateChange((_event, next) => {
      eventReceived = true;
      if (active) {
        setSession(next);
        setLoading(false);
        setError(null);
      }
    });
    client.auth
      .getSession()
      .then(({ data, error: failure }) => {
        if (!active || eventReceived) return;
        setSession(data.session);
        setError(failure?.message ?? null);
        setLoading(false);
      })
      .catch(() => {
        if (active) {
          setError('Could not restore your session. Please sign in again.');
          setLoading(false);
        }
      });
    const refresh = (state: string) =>
      state === 'active' ? client.auth.startAutoRefresh() : client.auth.stopAutoRefresh();
    refresh(AppState.currentState ?? 'active');
    const listener = AppState.addEventListener('change', refresh);
    return () => {
      active = false;
      subscription.unsubscribe();
      listener.remove();
      client.auth.stopAutoRefresh();
    };
  }, []);
  return (
    <AuthContext.Provider value={{ session, loading, error }}>{children}</AuthContext.Provider>
  );
}
export const useAuth = () => useContext(AuthContext);

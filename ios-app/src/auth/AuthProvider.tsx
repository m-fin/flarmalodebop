import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { emailFor, type Username } from '@/lib/config';
import { supabase } from '@/lib/supabase';
import { asProfile, type Profile } from '@/lib/types';

type AuthValue = {
  ready: boolean;
  session: Session | null;
  me: Profile | null;
  other: Profile | null;
  signIn: (username: Username, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
};

const AuthContext = createContext<AuthValue | null>(null);

async function loadPair(userId: string): Promise<{ me: Profile; other: Profile } | string> {
  const { data, error } = await supabase.from('profiles').select('*');
  if (error) return error.message;
  const profiles = (data ?? []).map((row) => asProfile(row as Record<string, unknown>));
  const me = profiles.find((profile) => profile.id === userId);
  const other = profiles.find((profile) => profile.id !== userId);
  if (!me || !other) return 'This account isn’t part of Flarmalodebop.';
  return { me, other };
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [session, setSession] = useState<Session | null>(null);
  const [me, setMe] = useState<Profile | null>(null);
  const [other, setOther] = useState<Profile | null>(null);

  const applySession = useCallback(async (next: Session | null) => {
    setSession(next);
    if (!next) {
      setMe(null);
      setOther(null);
      return;
    }
    if (next.access_token) await supabase.realtime.setAuth(next.access_token);
    const pair = await loadPair(next.user.id);
    if (typeof pair === 'string') {
      await supabase.auth.signOut();
      setSession(null);
      setMe(null);
      setOther(null);
      return;
    }
    setMe(pair.me);
    setOther(pair.other);
  }, []);

  useEffect(() => {
    let live = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!live) return;
      applySession(data.session).finally(() => {
        if (live) setReady(true);
      });
    });
    const { data: sub } = supabase.auth.onAuthStateChange((event, next) => {
      if (event === 'TOKEN_REFRESHED' && next?.access_token) {
        supabase.realtime.setAuth(next.access_token).catch(() => {});
        setSession(next);
        return;
      }
      if (event === 'SIGNED_OUT') {
        setSession(null);
        setMe(null);
        setOther(null);
      }
    });
    return () => {
      live = false;
      sub.subscription.unsubscribe();
    };
  }, [applySession]);

  const signIn = useCallback(async (username: Username, password: string) => {
    const email = emailFor(username);
    if (!email) return 'Pick Frog or Hailey.';
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error || !data.session) {
      return error && /invalid/i.test(error.message) ? 'That name/password combo is off-key.' : error?.message ?? 'Could not sign in.';
    }
    const pair = await loadPair(data.session.user.id);
    if (typeof pair === 'string') {
      await supabase.auth.signOut();
      return pair;
    }
    if (data.session.access_token) await supabase.realtime.setAuth(data.session.access_token);
    setSession(data.session);
    setMe(pair.me);
    setOther(pair.other);
    return null;
  }, []);

  const signOut = useCallback(async () => {
    await supabase.auth.signOut();
    setSession(null);
    setMe(null);
    setOther(null);
  }, []);

  const value = useMemo(
    () => ({ ready, session, me, other, signIn, signOut }),
    [ready, session, me, other, signIn, signOut],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('AuthProvider is missing');
  return value;
}

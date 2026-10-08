import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { api, refreshSession, setAccessToken, setAuthLostHandler } from './api';

export interface User {
  id: string; email: string; fullName: string; universityId?: string | null; phone?: string | null;
  role: string; roleLabel: string; department: string | null; permissions: string[];
}
interface AuthCtx {
  user: User | null; loading: boolean;
  login: (email: string, password: string) => Promise<User>;
  logout: () => Promise<void>;
  can: (...perms: string[]) => boolean;
}
const Ctx = createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const qc = useQueryClient();

  useEffect(() => {
    setAuthLostHandler(() => { setUser(null); qc.clear(); });
    refreshSession().then((r) => { if (r) setUser(r.user); }).catch(() => undefined).finally(() => setLoading(false));
  }, [qc]);

  const login = useCallback(async (email: string, password: string) => {
    const r = await api('/auth/login', { method: 'POST', json: { email, password } });
    setAccessToken(r.accessToken); setUser(r.user); return r.user as User;
  }, []);
  const logout = useCallback(async () => {
    try { await api('/auth/logout', { method: 'POST', json: {} }); } finally { setAccessToken(null); setUser(null); qc.clear(); }
  }, [qc]);
  const can = useCallback((...perms: string[]) => !!user && perms.every((p) => user.permissions.includes(p)), [user]);

  const value = useMemo(() => ({ user, loading, login, logout, can }), [user, loading, login, logout, can]);
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useAuth must be used inside AuthProvider');
  return c;
}

import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { useRouter } from 'next/router';

export type AuthMode = 'eid' | 'mock' | 'guest';

export type Role = 'admin' | 'user' | 'verifier';

interface AuthContextValue {
  token: string | null;
  eligibility: boolean;
  isLoggedIn: boolean;
  mode: AuthMode;
  role: Role;
  setMode: (m: AuthMode) => void;
  login: (token: string, eligibility: boolean, mode: AuthMode) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue>({
  token: null,
  eligibility: false,
  isLoggedIn: false,
  mode: 'guest',
  role: 'user',
  setMode: () => {},
  login: () => {},
  logout: () => {},
});

function decodePayload(token: string): any {
  try {
    const base64 = token.split('.')[1];
    const json = atob(base64.replace(/-/g, '+').replace(/_/g, '/'));
    return JSON.parse(json);
  } catch {
    return null;
  }
}

function tokenExpired(token: string): boolean {
  const payload = decodePayload(token);
  if (payload && payload.exp) {
    return Date.now() / 1000 > payload.exp;
  }
  return false;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [token, setToken] = useState<string | null>(null);
  const [eligibility, setEligibility] = useState<boolean>(false);
  const [mode, setMode] = useState<AuthMode>('guest');
  const [role, setRole] = useState<Role>('user');
  const router = useRouter();

  useEffect(() => {
    const stored = localStorage.getItem('id_token');
    const storedMode = (localStorage.getItem('auth_mode') as AuthMode) || 'guest';
    setMode(storedMode);
    if (stored && !tokenExpired(stored)) {
      setToken(stored);
      setEligibility(localStorage.getItem('eligibility') === 'true');
      const p = decodePayload(stored);
      setRole(p?.role === 'admin' || p?.role === 'verifier' ? p.role : 'user');
    } else {
      localStorage.removeItem('id_token');
      localStorage.removeItem('eligibility');
    }

    const handler = (e: MessageEvent) => {
      if (e.origin !== 'http://localhost:3000') return;
      const { id_token, eligibility: elig } = e.data || {};
      if (typeof id_token === 'string' && typeof elig === 'boolean') {
        const m = (localStorage.getItem('auth_mode') as AuthMode) || 'eid';
        login(id_token, elig, m);
        router.replace('/dashboard');
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const login = (tok: string, elig: boolean, m: AuthMode) => {
    setToken(tok);
    setEligibility(elig);
    setMode(m);
    const p = decodePayload(tok);
    setRole(p?.role === 'admin' || p?.role === 'verifier' ? p.role : 'user');
    localStorage.setItem('id_token', tok);
    localStorage.setItem('eligibility', String(elig));
    localStorage.setItem('auth_mode', m);
  };

  const logout = () => {
    setToken(null);
    setEligibility(false);
    setMode('guest');
    setRole('user');
    localStorage.removeItem('id_token');
    localStorage.removeItem('eligibility');
    localStorage.removeItem('auth_mode');
    router.replace('/');
  };

  return (
    <AuthContext.Provider value={{ token, eligibility, isLoggedIn: !!token, mode, role, setMode, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}


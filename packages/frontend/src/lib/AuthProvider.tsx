import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { useRouter } from 'next/router';

interface AuthContextValue {
  token: string | null;
  eligibility: boolean;
  isLoggedIn: boolean;
  login: (token: string, eligibility: boolean) => void;
  logout: () => void;
}

const AuthContext = createContext<AuthContextValue>({
  token: null,
  eligibility: false,
  isLoggedIn: false,
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
  const router = useRouter();

  useEffect(() => {
    const stored = localStorage.getItem('id_token');
    if (stored && !tokenExpired(stored)) {
      setToken(stored);
      setEligibility(localStorage.getItem('eligibility') === 'true');
    } else {
      localStorage.removeItem('id_token');
      localStorage.removeItem('eligibility');
    }

    const handler = (e: MessageEvent) => {
      if (e.origin !== 'http://localhost:3000') return;
      const { id_token, eligibility: elig } = e.data || {};
      if (typeof id_token === 'string' && typeof elig === 'boolean') {
        login(id_token, elig);
        router.replace('/dashboard');
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const login = (tok: string, elig: boolean) => {
    setToken(tok);
    setEligibility(elig);
    localStorage.setItem('id_token', tok);
    localStorage.setItem('eligibility', String(elig));
  };

  const logout = () => {
    setToken(null);
    setEligibility(false);
    localStorage.removeItem('id_token');
    localStorage.removeItem('eligibility');
    if (typeof window !== 'undefined') {
      window.location.href = '/';
    }
  };

  return (
    <AuthContext.Provider value={{ token, eligibility, isLoggedIn: !!token, login, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  return useContext(AuthContext);
}


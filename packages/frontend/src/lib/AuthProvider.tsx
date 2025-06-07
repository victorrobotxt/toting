// packages/frontend/src/lib/AuthProvider.tsx
import React, { createContext, useContext, useState, useEffect, useCallback, ReactNode } from 'react';
import { useRouter } from 'next/router';
import { jwtDecode } from 'jwt-decode';

export type Role = 'admin' | 'user' | 'verifier' | 'guest';
export type AuthMode = 'eid' | 'mock' | 'guest';

interface AuthContextType {
  isLoggedIn: boolean;
  token: string | null;
  role: Role;
  eligibility: boolean;
  mode: AuthMode;
  ready: boolean;
  login: (token: string, eligibility: boolean, mode: AuthMode) => void;
  logout: () => void;
  setMode: (mode: AuthMode) => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function getRoleFromToken(token: string | null): Role {
  if (!token) return 'guest';
  try {
    const decoded: { role?: Role } = jwtDecode(token);
    return decoded.role || 'user';
  } catch (e) {
    console.error("Failed to decode token", e);
    return 'guest';
  }
}

export const AuthProvider: React.FC<{ children: ReactNode }> = ({ children }) => {
  const [token, setToken] = useState<string | null>(null);
  const [eligibility, setEligibility] = useState<boolean>(false);
  const [mode, setModeState] = useState<AuthMode>('guest');
  const [ready, setReady] = useState<boolean>(false);
  const router = useRouter();

  const login = useCallback((newToken: string, newEligibility: boolean, newMode: AuthMode) => {
    sessionStorage.setItem('id_token', newToken);
    sessionStorage.setItem('eligibility', String(newEligibility));
    sessionStorage.setItem('auth_mode', newMode);
    setToken(newToken);
    setEligibility(newEligibility);
    setModeState(newMode);
    router.push('/dashboard');
  }, [router]);

  const handleMessage = useCallback((event: MessageEvent) => {
    // Ensure the message is from a trusted origin
    if (event.origin !== window.location.origin) return;

    const { id_token, eligibility: elig } = event.data;
    if (id_token) {
      // Assuming 'eid' mode for popup-based flows
      login(id_token, !!elig, 'eid');
    }
  }, [login]);

  useEffect(() => {
    window.addEventListener('message', handleMessage);

    const storedToken = sessionStorage.getItem('id_token');
    const storedEligibility = sessionStorage.getItem('eligibility') === 'true';
    const storedMode = (sessionStorage.getItem('auth_mode') as AuthMode) || 'guest';

    if (storedToken) {
      setToken(storedToken);
      setEligibility(storedEligibility);
      setModeState(storedMode);
    }
    setReady(true); // Signal that initial state is loaded

    return () => {
      window.removeEventListener('message', handleMessage);
    };
  }, [handleMessage]);

  const logout = useCallback(() => {
    sessionStorage.removeItem('id_token');
    sessionStorage.removeItem('eligibility');
    sessionStorage.removeItem('auth_mode');
    setToken(null);
    setEligibility(false);
    setModeState('guest');
    router.push('/login');
  }, [router]);
  
  const setMode = useCallback((newMode: AuthMode) => {
    sessionStorage.setItem('auth_mode', newMode);
    setModeState(newMode);
  }, []);

  const value = {
    isLoggedIn: !!token,
    token,
    role: getRoleFromToken(token),
    eligibility,
    mode,
    ready,
    login,
    logout,
    setMode,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
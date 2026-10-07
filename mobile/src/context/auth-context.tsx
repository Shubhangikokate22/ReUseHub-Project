import * as SecureStore from 'expo-secure-store';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type PropsWithChildren } from 'react';
import { Platform } from 'react-native';
import { apiRequest } from '@/lib/api';

export type User = {
  id: string;
  name: string;
  email: string;
  role: 'USER' | 'ADMIN';
  createdAt: string;
  updatedAt: string;
};

type AuthResponse = { token: string; user: User };
type MeResponse = { user: User };
type AuthContextValue = {
  user: User | null;
  token: string | null;
  ready: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  setProfile: (user: User) => void;
  logout: () => Promise<void>;
};

const TOKEN_KEY = 'reusehub.auth.token';
const AuthContext = createContext<AuthContextValue | null>(null);

async function readToken() {
  if (Platform.OS === 'web') return typeof window === 'undefined' ? null : window.sessionStorage.getItem(TOKEN_KEY);
  return SecureStore.getItemAsync(TOKEN_KEY);
}

async function saveToken(token: string | null) {
  if (Platform.OS === 'web') {
    if (typeof window === 'undefined') return;
    if (token) window.sessionStorage.setItem(TOKEN_KEY, token);
    else window.sessionStorage.removeItem(TOKEN_KEY);
    return;
  }
  if (token) await SecureStore.setItemAsync(TOKEN_KEY, token);
  else await SecureStore.deleteItemAsync(TOKEN_KEY);
}

export function AuthProvider({ children }: PropsWithChildren) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  const acceptAuth = useCallback(async (result: AuthResponse) => {
    await saveToken(result.token);
    setToken(result.token);
    setUser(result.user);
  }, []);

  useEffect(() => {
    let active = true;
    void (async () => {
      try {
        const stored = await readToken();
        if (!stored) return;
        const result = await apiRequest<MeResponse>('/auth/me', { token: stored });
        if (active) {
          setToken(stored);
          setUser(result.user);
        }
      } catch {
        await saveToken(null).catch(() => undefined);
      } finally {
        if (active) setReady(true);
      }
    })();
    return () => { active = false; };
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const result = await apiRequest<AuthResponse>('/auth/login', { method: 'POST', body: { email, password } });
    await acceptAuth(result);
  }, [acceptAuth]);

  const register = useCallback(async (name: string, email: string, password: string) => {
    const result = await apiRequest<AuthResponse>('/auth/register', { method: 'POST', body: { name, email, password } });
    await acceptAuth(result);
  }, [acceptAuth]);

  const logout = useCallback(async () => {
    await saveToken(null);
    setToken(null);
    setUser(null);
  }, []);

  const setProfile = useCallback((updatedUser: User) => setUser(updatedUser), []);

  const value = useMemo(() => ({ user, token, ready, login, register, setProfile, logout }), [user, token, ready, login, register, setProfile, logout]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used within AuthProvider.');
  return value;
}

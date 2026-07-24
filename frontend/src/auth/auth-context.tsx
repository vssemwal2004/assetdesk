import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

import type {
  AuthUser,
  ChangeInitialPasswordRequest,
  ChangePasswordRequest,
  LoginRequest,
} from '@assetdesk/contracts';

import {
  changeInitialPassword as changeInitialPasswordRequest,
  changePassword as changePasswordRequest,
  getCurrentUser,
  login as loginRequest,
  logout as logoutRequest,
} from '../lib/auth-api';
import { isApiError, onSessionExpired } from '../lib/api-client';

type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated' | 'error';

interface AuthContextValue {
  status: AuthStatus;
  user: AuthUser | null;
  error: string | null;
  login: (input: LoginRequest) => Promise<AuthUser>;
  changeInitialPassword: (input: ChangeInitialPasswordRequest) => Promise<AuthUser>;
  changePassword: (input: ChangePasswordRequest) => Promise<AuthUser>;
  logout: () => Promise<void>;
  reload: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

function sessionErrorMessage(error: unknown): string {
  if (isApiError(error)) {
    return `${error.message}${error.requestId ? ` Reference: ${error.requestId}` : ''}`;
  }
  return 'AssetDesk could not verify your session.';
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [status, setStatus] = useState<AuthStatus>('loading');
  const [user, setUser] = useState<AuthUser | null>(null);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setStatus('loading');
    setError(null);
    try {
      const nextUser = await getCurrentUser();
      setUser(nextUser);
      setStatus('authenticated');
    } catch (requestError) {
      setUser(null);
      if (isApiError(requestError) && [401, 403].includes(requestError.status)) {
        setStatus('unauthenticated');
      } else {
        setError(sessionErrorMessage(requestError));
        setStatus('error');
      }
    }
  }, []);

  useEffect(() => {
    let active = true;

    void getCurrentUser()
      .then((nextUser) => {
        if (!active) return;
        setUser(nextUser);
        setStatus('authenticated');
      })
      .catch((requestError: unknown) => {
        if (!active) return;
        setUser(null);
        if (isApiError(requestError) && [401, 403].includes(requestError.status)) {
          setStatus('unauthenticated');
        } else {
          setError(sessionErrorMessage(requestError));
          setStatus('error');
        }
      });

    return () => {
      active = false;
    };
  }, []);

  useEffect(
    () =>
      onSessionExpired(() => {
        setUser(null);
        setError(null);
        setStatus('unauthenticated');
      }),
    [],
  );

  useEffect(() => {
    async function refreshVisibleSession() {
      if (document.visibilityState !== 'visible' || status !== 'authenticated') return;
      try {
        const nextUser = await getCurrentUser();
        setUser(nextUser);
      } catch {
        setUser(null);
        setStatus('unauthenticated');
      }
    }
    window.addEventListener('focus', refreshVisibleSession);
    document.addEventListener('visibilitychange', refreshVisibleSession);
    return () => {
      window.removeEventListener('focus', refreshVisibleSession);
      document.removeEventListener('visibilitychange', refreshVisibleSession);
    };
  }, [status]);

  const login = useCallback(async (input: LoginRequest) => {
    const nextUser = await loginRequest(input);
    setUser(nextUser);
    setStatus('authenticated');
    setError(null);
    return nextUser;
  }, []);

  const changeInitialPassword = useCallback(async (input: ChangeInitialPasswordRequest) => {
    const nextUser = await changeInitialPasswordRequest(input);
    setUser(nextUser);
    setStatus('authenticated');
    return nextUser;
  }, []);

  const changePassword = useCallback(async (input: ChangePasswordRequest) => {
    const nextUser = await changePasswordRequest(input);
    setUser(nextUser);
    setStatus('authenticated');
    return nextUser;
  }, []);

  const logout = useCallback(async () => {
    try {
      await logoutRequest();
    } finally {
      setUser(null);
      setError(null);
      setStatus('unauthenticated');
    }
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      status,
      user,
      error,
      login,
      changeInitialPassword,
      changePassword,
      logout,
      reload,
    }),
    [status, user, error, login, changeInitialPassword, changePassword, logout, reload],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}

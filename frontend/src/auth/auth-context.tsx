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
import { isApiError, keepSessionAlive, onSessionExpired } from '../lib/api-client';

type AuthStatus = 'loading' | 'authenticated' | 'unauthenticated' | 'error';

const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'wheel', 'touchstart'] as const;

interface AuthContextValue {
  status: AuthStatus;
  user: AuthUser | null;
  error: string | null;
  login: (input: LoginRequest) => Promise<AuthUser>;
  changeInitialPassword: (input: ChangeInitialPasswordRequest) => Promise<AuthUser>;
  changePassword: (input: ChangePasswordRequest) => Promise<AuthUser>;
  acceptAuthenticatedUser: (user: AuthUser) => void;
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

    // Every tab (including links opened in a new tab) reuses the browser's existing session.
    // Previously a tab without a per-tab flag revoked the session on the server, which signed
    // the user out of every open tab.
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
    let lastCheck = 0;
    async function refreshVisibleSession() {
      if (document.visibilityState !== 'visible' || status !== 'authenticated') return;
      // focus and visibilitychange usually fire together; one check is enough.
      const now = Date.now();
      if (now - lastCheck < 5_000) return;
      lastCheck = now;
      try {
        const nextUser = await getCurrentUser();
        setUser(nextUser);
      } catch (requestError) {
        // Only a rejected session signs the user out. A flaky network or a server restart
        // must not, the next request will simply try again.
        if (isApiError(requestError) && [401, 403].includes(requestError.status)) {
          setUser(null);
          setStatus('unauthenticated');
        }
      }
    }
    window.addEventListener('focus', refreshVisibleSession);
    document.addEventListener('visibilitychange', refreshVisibleSession);
    return () => {
      window.removeEventListener('focus', refreshVisibleSession);
      document.removeEventListener('visibilitychange', refreshVisibleSession);
    };
  }, [status]);

  useEffect(() => {
    if (status !== 'authenticated') return;
    function onActivity() {
      void keepSessionAlive();
    }
    for (const eventName of ACTIVITY_EVENTS) {
      window.addEventListener(eventName, onActivity, { passive: true });
    }
    return () => {
      for (const eventName of ACTIVITY_EVENTS) {
        window.removeEventListener(eventName, onActivity);
      }
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

  const acceptAuthenticatedUser = useCallback((nextUser: AuthUser) => {
    setUser(nextUser);
    setStatus('authenticated');
    setError(null);
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
      acceptAuthenticatedUser,
      logout,
      reload,
    }),
    [
      status,
      user,
      error,
      login,
      changeInitialPassword,
      changePassword,
      acceptAuthenticatedUser,
      logout,
      reload,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const value = useContext(AuthContext);
  if (!value) throw new Error('useAuth must be used inside AuthProvider');
  return value;
}

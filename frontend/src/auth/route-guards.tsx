import { Navigate, Outlet, useLocation } from 'react-router';

import { AlertCircle, RefreshCw } from 'lucide-react';

import { useAuth } from './auth-context';
import { hasPermission } from './permissions';
import type { WorkerPermission } from '@assetdesk/contracts';

function SessionLoading() {
  return (
    <main
      aria-busy="true"
      aria-label="Loading AssetDesk"
      className="grid min-h-dvh place-items-center bg-[var(--color-background)] p-4"
    >
      <div className="w-full max-w-sm space-y-4 rounded-[18px] border border-[var(--color-border)] bg-white p-6 shadow-[var(--shadow-card)]">
        <div className="skeleton h-11 w-11 rounded-xl" />
        <div className="skeleton h-7 w-44 rounded-lg" />
        <div className="skeleton h-4 w-full rounded-md" />
        <div className="skeleton h-12 w-full rounded-[10px]" />
      </div>
    </main>
  );
}

function SessionError({ message, retry }: { message: string; retry: () => Promise<void> }) {
  return (
    <main className="grid min-h-dvh place-items-center bg-[var(--color-background)] p-4">
      <section className="w-full max-w-md rounded-[18px] border border-red-200 bg-white p-6 shadow-[var(--shadow-card)]">
        <div className="grid size-11 place-items-center rounded-xl bg-red-50 text-red-700">
          <AlertCircle aria-hidden="true" size={22} />
        </div>
        <h1 className="mt-4 text-xl font-bold text-[var(--color-primary-strong)]">
          Session check failed
        </h1>
        <p className="mt-2 text-sm leading-6 text-[var(--color-text-muted)]">{message}</p>
        <button className="button-primary mt-5" onClick={() => void retry()} type="button">
          <RefreshCw aria-hidden="true" size={18} />
          Try again
        </button>
      </section>
    </main>
  );
}

function AuthStateBoundary({ children }: { children: React.ReactNode }) {
  const auth = useAuth();
  if (auth.status === 'loading') return <SessionLoading />;
  if (auth.status === 'error') {
    return (
      <SessionError
        message={auth.error ?? 'The session could not be checked.'}
        retry={auth.reload}
      />
    );
  }
  return children;
}

export function PublicOnlyRoute() {
  const auth = useAuth();
  return (
    <AuthStateBoundary>
      {auth.status === 'authenticated' ? (
        <Navigate
          to={auth.user?.mustChangePassword ? '/change-initial-password' : '/dashboard'}
          replace
        />
      ) : (
        <Outlet />
      )}
    </AuthStateBoundary>
  );
}

export function InitialPasswordRoute() {
  const auth = useAuth();
  return (
    <AuthStateBoundary>
      {auth.status !== 'authenticated' ? (
        <Navigate to="/login" replace />
      ) : auth.user?.mustChangePassword ? (
        <Outlet />
      ) : (
        <Navigate to="/dashboard" replace />
      )}
    </AuthStateBoundary>
  );
}

export function ProtectedRoute() {
  const auth = useAuth();
  const location = useLocation();
  return (
    <AuthStateBoundary>
      {auth.status !== 'authenticated' ? (
        <Navigate to="/login" replace state={{ from: location.pathname }} />
      ) : auth.user?.mustChangePassword ? (
        <Navigate to="/change-initial-password" replace />
      ) : (
        <Outlet />
      )}
    </AuthStateBoundary>
  );
}

export function AdminRoute() {
  const auth = useAuth();
  return auth.user?.role === 'ADMIN' ? <Outlet /> : <Navigate to="/access-denied" replace />;
}

export function PermissionRoute({ permission }: { permission: WorkerPermission }) {
  const auth = useAuth();
  return hasPermission(auth.user, permission) ? <Outlet /> : <Navigate to="/access-denied" replace />;
}

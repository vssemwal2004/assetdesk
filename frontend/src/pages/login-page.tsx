import { LockKeyhole, ShieldCheck, UserRoundCheck } from 'lucide-react';
import { useRef, useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router';

import { useAuth } from '../auth/auth-context';
import { Brand, Button, ErrorSummary, PasswordField, TextField } from '../components/ui';
import { isApiError } from '../lib/api-client';

export function LoginPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const identifierRef = useRef<HTMLInputElement>(null);
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    if (!identifier.trim() || !password) {
      setError('Enter your Worker ID or Admin email and password.');
      identifierRef.current?.focus();
      return;
    }

    setSubmitting(true);
    try {
      const user = await auth.login({ identifier: identifier.trim(), password });
      if (user.mustChangePassword) {
        navigate('/change-initial-password', { replace: true });
      } else {
        const requestedPath = (location.state as { from?: string } | null)?.from;
        navigate(requestedPath && requestedPath !== '/login' ? requestedPath : '/dashboard', {
          replace: true,
        });
      }
    } catch (requestError) {
      setError(
        isApiError(requestError)
          ? requestError.message
          : 'AssetDesk could not sign you in. Try again.',
      );
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="grid min-h-dvh bg-[var(--color-background)] lg:grid-cols-[minmax(0,0.9fr)_minmax(500px,1.1fr)]">
      <section className="hidden bg-[linear-gradient(145deg,#4c1d95_0%,#6d28d9_58%,#7c3aed_100%)] p-10 text-white lg:flex lg:flex-col lg:justify-between xl:p-14">
        <BrandOnPurple />
        <div className="max-w-lg">
          <p className="text-sm font-bold text-purple-100">University material control</p>
          <h1 className="mt-3 text-4xl font-extrabold leading-[1.12]">
            Issue and return records in one secure workspace.
          </h1>
          <div className="mt-8 grid gap-3">
            <Feature icon={UserRoundCheck} text="Role-based access for Admins and Workers" />
            <Feature icon={ShieldCheck} text="Protected university account sessions" />
            <Feature icon={LockKeyhole} text="Mandatory password change for new accounts" />
          </div>
        </div>
        <p className="text-xs font-semibold text-purple-100">AssetDesk · University operations</p>
      </section>

      <section className="flex min-h-dvh items-center justify-center px-4 py-8 sm:px-8">
        <div className="w-full max-w-[440px]">
          <div className="mb-8 lg:hidden">
            <Brand />
          </div>
          <div className="rounded-[18px] border border-[var(--color-border)] bg-white p-5 shadow-[var(--shadow-card)] sm:p-8">
            <div className="grid size-11 place-items-center rounded-xl bg-[var(--color-primary-soft)] text-[var(--color-primary)]">
              <LockKeyhole aria-hidden="true" size={22} />
            </div>
            <h1 className="mt-4 text-2xl font-extrabold text-[var(--color-primary-strong)]">
              Sign in to AssetDesk
            </h1>
            <p className="mt-1 text-sm leading-6 text-[var(--color-text-muted)]">
              Use your Worker ID or Admin email.
            </p>

            <form className="mt-6 space-y-5" noValidate onSubmit={(event) => void submit(event)}>
              {error ? <ErrorSummary message={error} title="Sign in failed" /> : null}
              <TextField
                autoCapitalize="none"
                autoComplete="username"
                autoFocus
                error={
                  !identifier.trim() && error ? 'Enter your Worker ID or Admin email.' : undefined
                }
                label="Worker ID or Admin email"
                onChange={(event) => setIdentifier(event.target.value)}
                placeholder="GEU-WRK-A7K4 or admin@university.edu"
                ref={identifierRef}
                spellCheck={false}
                value={identifier}
              />
              <PasswordField
                autoComplete="current-password"
                error={!password && error ? 'Enter your password.' : undefined}
                label="Password"
                onChange={(event) => setPassword(event.target.value)}
                value={password}
              />
              <Button className="w-full" loading={submitting} type="submit">
                {submitting ? 'Signing in…' : 'Sign in'}
              </Button>
            </form>

            <div className="mt-6 rounded-[12px] bg-[var(--color-surface-tint)] p-3.5">
              <p className="text-xs leading-5 text-[var(--color-text-muted)]">
                New Worker accounts must create a permanent password after their first sign-in.
              </p>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}

function BrandOnPurple() {
  return (
    <div className="flex items-center gap-3">
      <span className="grid size-14 place-items-center rounded-xl bg-white/95 p-1 shadow-lg">
        <img alt="AssetDesk logo" className="block size-full object-contain" src="/logo.webp" />
      </span>
      <span>
        <span className="block text-2xl font-extrabold leading-6">AssetDesk</span>
        <span className="mt-1 block text-[10px] font-extrabold uppercase leading-3 text-purple-100">
          Graphic Era Asset Management System
        </span>
      </span>
    </div>
  );
}

function Feature({ icon: Icon, text }: { icon: typeof ShieldCheck; text: string }) {
  return (
    <div className="flex items-center gap-3 rounded-[12px] bg-white/10 px-4 py-3 backdrop-blur-sm">
      <Icon aria-hidden="true" className="shrink-0 text-purple-100" size={20} />
      <p className="text-sm font-semibold">{text}</p>
    </div>
  );
}

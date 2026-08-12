import { Building2, LockKeyhole, LogIn, ShieldCheck } from 'lucide-react';
import { useRef, useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router';

import { useAuth } from '../auth/auth-context';
import { Button, ErrorSummary, PasswordField, TextField } from '../components/ui';
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
      setError('Enter your Employee ID or Admin email and password.');
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
    <main className="crm-auth-page">
      <aside aria-label="AssetDesk" className="crm-auth-brand">
        <div aria-hidden="true" className="crm-auth-structure">
          <span />
          <span />
          <span />
        </div>

        <div className="crm-auth-brand-top">
          <div className="crm-auth-university-logo">
            <img alt="Graphic Era Deemed to be University" src="/graphic-era-university.png" />
          </div>
        </div>

        <div className="crm-auth-brand-center">
          <span className="crm-auth-product-mark">
            <Building2 aria-hidden="true" size={26} />
          </span>
          <p className="crm-auth-brand-kicker">University asset operations</p>
          <p className="crm-auth-brand-name">AssetDesk</p>
          <p className="crm-auth-brand-description">
            <span>Graphic Era Asset</span>
            <span>Management System</span>
          </p>

          <div className="crm-auth-security-note">
            <ShieldCheck aria-hidden="true" size={21} />
            <span>
              <strong>Controlled access</strong>
              <span>Authorized university accounts only</span>
            </span>
          </div>
        </div>

        <footer className="crm-auth-brand-footer">
          <span>
            <span aria-hidden="true" className="crm-auth-status-dot" />
            Secure workspace
          </span>
          <span>Dehradun</span>
        </footer>
      </aside>

      <section aria-labelledby="login-title" className="crm-auth-workspace">
        <header className="crm-auth-workspace-header">
          <span className="crm-auth-workspace-label">Asset management system</span>
          <span className="crm-auth-access-status">
            <ShieldCheck aria-hidden="true" size={17} />
            Authorized access
          </span>
        </header>

        <div className="crm-auth-form-region">
          <div className="crm-auth-form-shell">
            <p className="crm-auth-overline">Welcome back</p>
            <h1 id="login-title">Sign in to AssetDesk</h1>
            <p className="crm-auth-form-intro">
              Enter your assigned university credentials to continue.
            </p>

            <form className="crm-auth-form" noValidate onSubmit={(event) => void submit(event)}>
              {error ? <ErrorSummary message={error} title="Sign in failed" /> : null}
              <TextField
                autoCapitalize="none"
                autoComplete="username"
                autoFocus
                error={
                  !identifier.trim() && error ? 'Enter your Employee ID or Admin email.' : undefined
                }
                label="Employee ID or Admin email"
                onChange={(event) => setIdentifier(event.target.value)}
                placeholder="Employee ID or university email"
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
              <Button className="crm-auth-submit w-full" loading={submitting} type="submit">
                {!submitting ? <LogIn aria-hidden="true" size={18} /> : null}
                {submitting ? 'Signing in...' : 'Sign in'}
              </Button>
            </form>

            <div className="crm-auth-first-signin">
              <span className="crm-auth-first-signin-icon">
                <LockKeyhole aria-hidden="true" size={19} />
              </span>
              <p>
                <strong>First time signing in?</strong>
                <span>New employee accounts create a permanent password after sign-in.</span>
              </p>
            </div>
          </div>
        </div>

        <footer className="crm-auth-workspace-footer">
          <span>Graphic Era Deemed to be University</span>
          <span aria-hidden="true">|</span>
          <span>Graphic Era Asset Management System</span>
        </footer>
      </section>
    </main>
  );
}

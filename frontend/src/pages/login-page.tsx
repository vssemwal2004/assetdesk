import { Building2, KeyRound, LockKeyhole, LogIn, Mail, ShieldCheck } from 'lucide-react';
import { useRef, useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router';

import { useAuth } from '../auth/auth-context';
import { Button, ErrorSummary, PasswordField, TextField } from '../components/ui';
import { isApiError } from '../lib/api-client';
import {
  completeForgotPassword,
  startForgotPassword,
  verifyForgotPasswordOtp,
} from '../lib/auth-api';

type ResetStep = 'email' | 'otp' | 'password' | 'done';

export function LoginPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const identifierRef = useRef<HTMLInputElement>(null);
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resetOpen, setResetOpen] = useState(false);
  const [resetStep, setResetStep] = useState<ResetStep>('email');
  const [resetEmail, setResetEmail] = useState('');
  const [resetId, setResetId] = useState('');
  const [resetOtp, setResetOtp] = useState('');
  const [resetPassword, setResetPassword] = useState('');
  const [resetConfirmPassword, setResetConfirmPassword] = useState('');
  const [resetError, setResetError] = useState<string | null>(null);
  const [resetSubmitting, setResetSubmitting] = useState(false);
  const [resetExpiresAt, setResetExpiresAt] = useState('');

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

  function closeReset() {
    setResetOpen(false);
    setResetStep('email');
    setResetEmail('');
    setResetId('');
    setResetOtp('');
    setResetPassword('');
    setResetConfirmPassword('');
    setResetError(null);
    setResetExpiresAt('');
  }

  async function requestResetOtp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setResetError(null);
    if (!resetEmail.trim()) {
      setResetError('Enter your registered Employee or Admin email.');
      return;
    }
    setResetSubmitting(true);
    try {
      const response = await startForgotPassword({ email: resetEmail.trim() });
      setResetId(response.resetId);
      setResetExpiresAt(response.expiresAt);
      setResetStep('otp');
    } catch (requestError) {
      setResetError(
        isApiError(requestError)
          ? requestError.message
          : 'The verification code could not be sent.',
      );
    } finally {
      setResetSubmitting(false);
    }
  }

  async function verifyResetOtp(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setResetError(null);
    if (!/^[A-Z0-9]{5}$/.test(resetOtp.trim().toUpperCase())) {
      setResetError('Enter the 5-character OTP sent to your email.');
      return;
    }
    setResetSubmitting(true);
    try {
      await verifyForgotPasswordOtp({ resetId, otp: resetOtp.trim().toUpperCase() });
      setResetStep('password');
    } catch (requestError) {
      setResetError(
        isApiError(requestError) ? requestError.message : 'The OTP could not be verified.',
      );
    } finally {
      setResetSubmitting(false);
    }
  }

  async function finishPasswordReset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setResetError(null);
    if (resetPassword !== resetConfirmPassword) {
      setResetError('New password and confirm password must match.');
      return;
    }
    setResetSubmitting(true);
    try {
      const user = await completeForgotPassword({
        resetId,
        otp: resetOtp.trim().toUpperCase(),
        newPassword: resetPassword,
      });
      auth.acceptAuthenticatedUser(user);
      setResetStep('done');
      window.setTimeout(() => {
        closeReset();
        navigate(user.mustChangePassword ? '/change-initial-password' : '/dashboard', {
          replace: true,
        });
      }, 450);
    } catch (requestError) {
      setResetError(
        isApiError(requestError) ? requestError.message : 'The password could not be changed.',
      );
    } finally {
      setResetSubmitting(false);
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
              <button
                className="crm-auth-forgot-link"
                onClick={() => {
                  setResetOpen(true);
                  setResetEmail(identifier.includes('@') ? identifier : '');
                }}
                type="button"
              >
                Forgot password?
              </button>
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
      {resetOpen ? (
        <PasswordResetDialog
          confirmPassword={resetConfirmPassword}
          email={resetEmail}
          error={resetError}
          expiresAt={resetExpiresAt}
          newPassword={resetPassword}
          onClose={closeReset}
          onConfirmPasswordChange={setResetConfirmPassword}
          onEmailChange={setResetEmail}
          onNewPasswordChange={setResetPassword}
          onOtpChange={(value) =>
            setResetOtp(
              value
                .toUpperCase()
                .replace(/[^A-Z0-9]/g, '')
                .slice(0, 5),
            )
          }
          onRequestOtp={requestResetOtp}
          onResetPassword={finishPasswordReset}
          onVerifyOtp={verifyResetOtp}
          otp={resetOtp}
          step={resetStep}
          submitting={resetSubmitting}
        />
      ) : null}
    </main>
  );
}

function PasswordResetDialog({
  step,
  email,
  otp,
  newPassword,
  confirmPassword,
  expiresAt,
  error,
  submitting,
  onEmailChange,
  onOtpChange,
  onNewPasswordChange,
  onConfirmPasswordChange,
  onRequestOtp,
  onVerifyOtp,
  onResetPassword,
  onClose,
}: {
  step: ResetStep;
  email: string;
  otp: string;
  newPassword: string;
  confirmPassword: string;
  expiresAt: string;
  error: string | null;
  submitting: boolean;
  onEmailChange: (value: string) => void;
  onOtpChange: (value: string) => void;
  onNewPasswordChange: (value: string) => void;
  onConfirmPasswordChange: (value: string) => void;
  onRequestOtp: (event: FormEvent<HTMLFormElement>) => void;
  onVerifyOtp: (event: FormEvent<HTMLFormElement>) => void;
  onResetPassword: (event: FormEvent<HTMLFormElement>) => void;
  onClose: () => void;
}) {
  const expiry = expiresAt
    ? new Intl.DateTimeFormat('en-IN', {
        dateStyle: 'medium',
        timeStyle: 'short',
        timeZone: 'Asia/Kolkata',
      }).format(new Date(expiresAt))
    : '';

  return (
    <div className="crm-reset-backdrop" role="presentation">
      <section
        aria-labelledby="reset-title"
        aria-modal="true"
        className="crm-reset-dialog"
        role="dialog"
      >
        <header className="crm-reset-header">
          <span className="crm-reset-icon">
            {step === 'email' ? (
              <Mail aria-hidden="true" size={22} />
            ) : (
              <KeyRound aria-hidden="true" size={22} />
            )}
          </span>
          <div>
            <p className="crm-reset-kicker">Account recovery</p>
            <h2 id="reset-title">Reset your password</h2>
          </div>
          <button
            aria-label="Close password reset"
            className="crm-reset-close"
            onClick={onClose}
            type="button"
          >
            x
          </button>
        </header>

        {error ? <ErrorSummary message={error} title="Recovery failed" /> : null}

        {step === 'email' ? (
          <form className="crm-reset-form" onSubmit={onRequestOtp}>
            <TextField
              autoComplete="email"
              label="Registered email"
              onChange={(event) => onEmailChange(event.target.value)}
              placeholder="name@geu.ac.in"
              type="email"
              value={email}
            />
            <Button loading={submitting} type="submit">
              Send OTP
            </Button>
          </form>
        ) : null}

        {step === 'otp' ? (
          <form className="crm-reset-form" onSubmit={onVerifyOtp}>
            <p className="crm-reset-copy">
              Enter the 5-character alphanumeric OTP sent to <strong>{email}</strong>.
              {expiry ? <span> It expires at {expiry}.</span> : null}
            </p>
            <TextField
              autoComplete="one-time-code"
              className="crm-reset-otp"
              label="OTP"
              maxLength={5}
              onChange={(event) => onOtpChange(event.target.value)}
              placeholder="A7K2P"
              value={otp}
            />
            <Button loading={submitting} type="submit">
              Verify OTP
            </Button>
          </form>
        ) : null}

        {step === 'password' ? (
          <form className="crm-reset-form" onSubmit={onResetPassword}>
            <PasswordField
              autoComplete="new-password"
              label="New password"
              onChange={(event) => onNewPasswordChange(event.target.value)}
              value={newPassword}
            />
            <PasswordField
              autoComplete="new-password"
              label="Confirm password"
              onChange={(event) => onConfirmPasswordChange(event.target.value)}
              value={confirmPassword}
            />
            <Button loading={submitting} type="submit">
              Change password
            </Button>
          </form>
        ) : null}

        {step === 'done' ? (
          <div className="crm-reset-done">
            <ShieldCheck aria-hidden="true" size={28} />
            <p>Password changed. Opening your account...</p>
          </div>
        ) : null}
      </section>
    </div>
  );
}

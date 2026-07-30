import { Check, KeyRound, LogOut, X } from 'lucide-react';
import { useRef, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';

import { useAuth } from '../auth/auth-context';
import { Brand, Button, ErrorSummary, PasswordField } from '../components/ui';
import { isApiError } from '../lib/api-client';

export function ChangeInitialPasswordPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const passwordRef = useRef<HTMLInputElement>(null);
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [fieldError, setFieldError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const requirements = [
    { label: '6 to 128 characters', met: newPassword.length >= 6 && newPassword.length <= 128 },
    {
      label: 'Contains at least 1 special character',
      met: newPassword.length === 0 ? null : /[^A-Za-z0-9\s]/u.test(newPassword),
    },
    {
      label: 'Both password fields match',
      met: confirmPassword.length > 0 && newPassword === confirmPassword,
    },
  ];

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setFieldError(null);

    if (newPassword.length < 6 || newPassword.length > 128) {
      setFieldError('Use a password between 6 and 128 characters.');
      passwordRef.current?.focus();
      return;
    }
    if (!/[^A-Za-z0-9\s]/u.test(newPassword)) {
      setFieldError('Include at least one special character.');
      passwordRef.current?.focus();
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('The password confirmation does not match.');
      return;
    }

    setSubmitting(true);
    try {
      await auth.changeInitialPassword({ newPassword });
      navigate('/dashboard', { replace: true });
    } catch (requestError) {
      if (isApiError(requestError)) {
        setFieldError(requestError.fields.newPassword ?? null);
        setError(requestError.message);
      } else {
        setError('AssetDesk could not save your new password. Try again.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function signOut() {
    await auth.logout();
    navigate('/login', { replace: true });
  }

  return (
    <main className="min-h-dvh bg-[var(--color-background)] px-4 py-6 sm:px-6 sm:py-10">
      <div className="mx-auto max-w-lg">
        <div className="mb-7 flex items-center justify-between">
          <Brand />
          <Button onClick={() => void signOut()} variant="quiet">
            <LogOut aria-hidden="true" size={18} />
            Sign out
          </Button>
        </div>
        <section className="rounded-[18px] border border-[var(--color-border)] bg-white p-5 shadow-[var(--shadow-card)] sm:p-8">
          <div className="grid size-12 place-items-center rounded-xl bg-[var(--color-primary-soft)] text-[var(--color-primary)]">
            <KeyRound aria-hidden="true" size={24} />
          </div>
          <p className="mt-5 text-xs font-bold uppercase tracking-[0.14em] text-[var(--color-primary)]">
            First sign-in
          </p>
          <h1 className="mt-1 text-2xl font-extrabold text-[var(--color-primary-strong)]">
            Create a new password
          </h1>
          <p className="mt-2 text-sm leading-6 text-[var(--color-text-muted)]">
            Your temporary password will stop working after this change. You must finish this step
            before using AssetDesk.
          </p>

          <form className="mt-6 space-y-5" noValidate onSubmit={(event) => void submit(event)}>
            {error ? <ErrorSummary message={error} /> : null}
            <PasswordField
              autoComplete="new-password"
              error={fieldError ?? undefined}
              label="New password"
              onChange={(event) => setNewPassword(event.target.value)}
              ref={passwordRef}
              value={newPassword}
            />
            <PasswordField
              autoComplete="new-password"
              error={
                confirmPassword && newPassword !== confirmPassword
                  ? 'Passwords do not match.'
                  : undefined
              }
              label="Confirm new password"
              onChange={(event) => setConfirmPassword(event.target.value)}
              value={confirmPassword}
            />

            <div className="rounded-[12px] bg-[var(--color-surface-tint)] p-4">
              <p className="text-sm font-bold text-[var(--color-primary-strong)]">
                Password requirements
              </p>
              <ul className="mt-2 space-y-2">
                {requirements.map((requirement) => (
                  <li
                    className="flex items-start gap-2 text-sm text-[var(--color-text-muted)]"
                    key={requirement.label}
                  >
                    {requirement.met === false ? (
                      <X
                        aria-hidden="true"
                        className="mt-0.5 shrink-0 text-[var(--color-danger)]"
                        size={16}
                      />
                    ) : requirement.met === true ? (
                      <Check
                        aria-hidden="true"
                        className="mt-0.5 shrink-0 text-[var(--color-success)]"
                        size={16}
                      />
                    ) : (
                      <span
                        aria-hidden="true"
                        className="mt-1.5 size-2 shrink-0 rounded-full bg-[var(--color-text-muted)]"
                      />
                    )}
                    {requirement.label}
                  </li>
                ))}
              </ul>
            </div>

            <Button className="w-full" loading={submitting} type="submit">
              {submitting ? 'Saving new password…' : 'Save new password'}
            </Button>
          </form>
        </section>
      </div>
    </main>
  );
}

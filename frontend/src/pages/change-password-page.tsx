import { KeyRound } from 'lucide-react';
import { useRef, useState, type FormEvent } from 'react';

import { useAuth } from '../auth/auth-context';
import {
  AppCard,
  Button,
  ErrorSummary,
  PageHeader,
  PasswordField,
  SuccessMark,
} from '../components/ui';
import { isApiError } from '../lib/api-client';

export function ChangePasswordPage() {
  const auth = useAuth();
  const currentRef = useRef<HTMLInputElement>(null);
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrors({});
    setMessage(null);
    setSuccess(false);
    if (!currentPassword) {
      setErrors({ currentPassword: 'Enter your current password.' });
      currentRef.current?.focus();
      return;
    }
    if (newPassword.length < 15 || newPassword.length > 128) {
      setErrors({ newPassword: 'Use a password between 15 and 128 characters.' });
      return;
    }
    if (newPassword !== confirmation) {
      setErrors({ confirmation: 'Passwords do not match.' });
      return;
    }

    setSubmitting(true);
    try {
      await auth.changePassword({ currentPassword, newPassword });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmation('');
      setSuccess(true);
    } catch (requestError) {
      if (isApiError(requestError)) {
        setMessage(requestError.message);
        setErrors(requestError.fields);
      } else {
        setMessage('AssetDesk could not change your password. Try again.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        description="Update the password for your AssetDesk account."
        title="Change password"
      />
      <AppCard className="max-w-xl">
        <div className="flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-xl bg-[var(--color-primary-soft)] text-[var(--color-primary)]">
            <KeyRound aria-hidden="true" size={22} />
          </span>
          <div>
            <h2 className="font-extrabold text-[var(--color-primary-strong)]">Account security</h2>
            <p className="text-sm text-[var(--color-text-muted)]">Use 15 to 128 characters.</p>
          </div>
        </div>
        {success ? (
          <div
            className="mt-6 flex gap-3 rounded-[12px] bg-[var(--color-success-soft)] p-4"
            role="status"
          >
            <SuccessMark label="Password changed" />
            <div>
              <p className="font-bold text-[var(--color-success)]">Password changed</p>
              <p className="mt-1 text-sm text-emerald-900">
                Use the new password the next time you sign in.
              </p>
            </div>
          </div>
        ) : null}
        <form className="mt-6 space-y-5" noValidate onSubmit={(event) => void submit(event)}>
          {message ? <ErrorSummary message={message} /> : null}
          <PasswordField
            autoComplete="current-password"
            error={errors.currentPassword}
            label="Current password"
            onChange={(event) => setCurrentPassword(event.target.value)}
            ref={currentRef}
            value={currentPassword}
          />
          <PasswordField
            autoComplete="new-password"
            error={errors.newPassword}
            hint="Do not include your name, email, or common words."
            label="New password"
            onChange={(event) => setNewPassword(event.target.value)}
            value={newPassword}
          />
          <PasswordField
            autoComplete="new-password"
            error={errors.confirmation}
            label="Confirm new password"
            onChange={(event) => setConfirmation(event.target.value)}
            value={confirmation}
          />
          <Button loading={submitting} type="submit">
            {submitting ? 'Changing password…' : 'Change password'}
          </Button>
        </form>
      </AppCard>
    </div>
  );
}

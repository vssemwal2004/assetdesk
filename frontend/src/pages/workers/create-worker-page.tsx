import { ArrowLeft, Check, Clipboard, Mail, UserPlus } from 'lucide-react';
import { useRef, useState, type FormEvent } from 'react';
import { Link } from 'react-router';

import {
  CreateWorkerRequestSchema,
  DEFAULT_WORKER_PERMISSIONS,
  type CreateWorkerRequest,
} from '@assetdesk/contracts';

import {
  AppCard,
  Button,
  ErrorSummary,
  PageHeader,
  SuccessMark,
  TextField,
} from '../../components/ui';
import { isApiError } from '../../lib/api-client';
import { createWorker, type WorkerCredentialResult } from '../../lib/workers-api';
import { PermissionMatrix, permissionLabels } from './permission-matrix';

const emptyForm = {
  name: '',
  email: '',
  contact: '',
  department: '',
  permissions: [...DEFAULT_WORKER_PERMISSIONS],
};

export function CreateWorkerPage() {
  const firstFieldRef = useRef<HTMLInputElement>(null);
  const [form, setForm] = useState(emptyForm);
  const [review, setReview] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<string | null>(null);
  const [result, setResult] = useState<WorkerCredentialResult | null>(null);
  const [copied, setCopied] = useState(false);

  function validate(): CreateWorkerRequest | null {
    const parsed = CreateWorkerRequestSchema.safeParse(form);
    if (parsed.success) return parsed.data;
    const fieldErrors: Record<string, string> = {};
    parsed.error.issues.forEach((issue) => {
      fieldErrors[String(issue.path[0] ?? 'request')] ??= issue.message;
    });
    setErrors(fieldErrors);
    setMessage('Correct the highlighted fields before continuing.');
    firstFieldRef.current?.focus();
    return null;
  }

  function continueToReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrors({});
    setMessage(null);
    if (validate()) setReview(true);
  }

  async function submit() {
    const input = validate();
    if (!input) {
      setReview(false);
      return;
    }
    setSubmitting(true);
    setMessage(null);
    try {
      const response = await createWorker(input, crypto.randomUUID());
      setResult(response.data);
    } catch (requestError) {
      if (isApiError(requestError)) {
        setErrors(requestError.fields);
        setMessage(requestError.message);
        if (Object.keys(requestError.fields).length > 0) setReview(false);
      } else {
        setMessage('AssetDesk could not create the Worker. Try again.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  function startAnother() {
    setForm(emptyForm);
    setReview(false);
    setResult(null);
    setErrors({});
    setMessage(null);
    setCopied(false);
    requestAnimationFrame(() => firstFieldRef.current?.focus());
  }

  async function copyCredential() {
    if (!result) return;
    await navigator.clipboard.writeText(
      `Worker ID: ${result.credential.workerId}\nTemporary password: ${result.credential.temporaryPassword}`,
    );
    setCopied(true);
  }

  if (result) {
    return (
      <div className="space-y-6">
        <PageHeader title="Worker created" />
        <AppCard className="mx-auto max-w-2xl">
          <SuccessMark label="Worker created" />
          <h2 className="mt-4 text-xl font-extrabold text-[var(--color-primary-strong)]">
            {result.worker.name} can now sign in
          </h2>
          <p className="mt-2 text-sm leading-6 text-[var(--color-text-muted)]">
            The invitation email is queued. Keep this one-time credential available until delivery
            is confirmed. The Worker must change this password at first sign-in.
          </p>
          <dl className="mt-5 grid gap-3 sm:grid-cols-2">
            <Credential label="Worker ID" value={result.credential.workerId} />
            <Credential
              label="Temporary password"
              value={result.credential.temporaryPassword}
              sensitive
            />
          </dl>
          <div className="mt-4 rounded-[12px] bg-[var(--color-warning-soft)] p-4">
            <p className="flex items-center gap-2 text-sm font-bold text-[var(--color-warning)]">
              <Mail aria-hidden="true" size={18} />
              Invitation email queued
            </p>
            <p className="mt-1 text-xs leading-5 text-amber-900">
              Temporary credential expires{' '}
              {new Intl.DateTimeFormat('en-IN', {
                dateStyle: 'medium',
                timeStyle: 'short',
                timeZone: 'Asia/Kolkata',
              }).format(new Date(result.credential.expiresAt))}
              .
            </p>
          </div>
          <div className="mt-6 flex flex-col gap-2 sm:flex-row">
            <Button onClick={() => void copyCredential()} variant="secondary">
              {copied ? (
                <Check aria-hidden="true" size={18} />
              ) : (
                <Clipboard aria-hidden="true" size={18} />
              )}
              {copied ? 'Copied' : 'Copy credential'}
            </Button>
            <Link className="button-secondary" to={`/workers/${result.worker.workerId}`}>
              View worker
            </Link>
            <Button onClick={startAnother}>Create another</Button>
          </div>
        </AppCard>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        actions={
          <Link className="button-quiet" to="/workers">
            <ArrowLeft aria-hidden="true" size={18} />
            Back to workers
          </Link>
        }
        description={
          review
            ? 'Check these details before creating the account.'
            : 'Enter the university Worker account details.'
        }
        title={review ? 'Review worker' : 'Add worker'}
      />

      <AppCard className="max-w-6xl">
        <div className="mb-5 flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-xl bg-[var(--color-primary-soft)] text-[var(--color-primary)]">
            <UserPlus aria-hidden="true" size={22} />
          </span>
          <div>
            <p className="text-xs font-bold text-[var(--color-primary)]">
              Step {review ? '2' : '1'} of 2
            </p>
            <h2 className="font-extrabold text-[var(--color-primary-strong)]">
              {review ? 'Review details' : 'Worker details'}
            </h2>
          </div>
        </div>
        {message ? <ErrorSummary message={message} /> : null}

        {review ? (
          <div className="mt-5">
            <dl className="divide-y divide-[var(--color-border)] rounded-[12px] border border-[var(--color-border)] px-4">
              {Object.entries({
                Name: form.name,
                Email: form.email,
                Contact: form.contact || 'Not provided',
                Department: form.department || 'Not provided',
                Access: `${form.permissions.length} permissions selected`,
              }).map(([label, value]) => (
                <div className="grid gap-1 py-3 sm:grid-cols-[130px_1fr]" key={label}>
                  <dt className="text-sm font-bold text-[var(--color-text-muted)]">{label}</dt>
                  <dd className="break-words text-sm font-semibold text-[var(--color-text-strong)]">
                    {value}
                  </dd>
                </div>
              ))}
            </dl>
            <div className="mt-5">
              <h3 className="field-label">Access permissions</h3>
              <div className="mt-2 flex flex-wrap gap-2">
                {form.permissions.map((permission) => (
                  <span
                    className="rounded-full bg-[var(--color-primary-soft)] px-2.5 py-1 text-xs font-bold text-[var(--color-primary)]"
                    key={permission}
                  >
                    {permissionLabels[permission]}
                  </span>
                ))}
              </div>
            </div>
            <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button disabled={submitting} onClick={() => setReview(false)} variant="secondary">
                Edit details
              </Button>
              <Button loading={submitting} onClick={() => void submit()}>
                {submitting ? 'Creating worker…' : 'Create worker'}
              </Button>
            </div>
          </div>
        ) : (
          <form className="mt-5 space-y-5" noValidate onSubmit={continueToReview}>
            <TextField
              autoComplete="name"
              error={errors.name}
              label="Worker name"
              onChange={(event) => setForm((value) => ({ ...value, name: event.target.value }))}
              ref={firstFieldRef}
              value={form.name}
            />
            <TextField
              autoCapitalize="none"
              autoComplete="email"
              error={errors.email}
              label="Email"
              onChange={(event) => setForm((value) => ({ ...value, email: event.target.value }))}
              spellCheck={false}
              type="email"
              value={form.email}
            />
            <div className="grid gap-5 sm:grid-cols-2">
              <TextField
                autoComplete="tel"
                error={errors.contact}
                label="Contact number"
                onChange={(event) =>
                  setForm((value) => ({ ...value, contact: event.target.value }))
                }
                optional
                type="tel"
                value={form.contact}
              />
              <TextField
                error={errors.department}
                label="Department"
                onChange={(event) =>
                  setForm((value) => ({ ...value, department: event.target.value }))
                }
                optional
                value={form.department}
              />
            </div>
            <section className="rounded-[10px] border border-[var(--color-border)] bg-[var(--color-surface-tint)] p-3 sm:p-4">
              <div className="mb-3">
                <h2 className="font-extrabold text-[var(--color-primary-strong)]">
                  Platform access
                </h2>
                <p className="mt-1 text-sm leading-6 text-[var(--color-text-muted)]">
                  Admin controls exactly what this worker can view or manage.
                </p>
              </div>
              <PermissionMatrix
                onChange={(permissions) => setForm((value) => ({ ...value, permissions }))}
                selected={form.permissions}
              />
              {errors.permissions ? (
                <p className="mt-2 text-sm font-semibold text-[var(--color-danger)]">
                  {errors.permissions}
                </p>
              ) : null}
            </section>
            <div className="flex justify-end">
              <Button type="submit">Continue to review</Button>
            </div>
          </form>
        )}
      </AppCard>
    </div>
  );
}

function Credential({
  label,
  value,
  sensitive = false,
}: {
  label: string;
  value: string;
  sensitive?: boolean;
}) {
  return (
    <div className="rounded-[12px] border border-[var(--color-border)] bg-[var(--color-surface-tint)] p-4">
      <dt className="text-xs font-bold text-[var(--color-text-muted)]">{label}</dt>
      <dd
        className={`mt-2 break-all text-sm font-extrabold text-[var(--color-primary-strong)] ${sensitive ? 'font-mono' : ''}`}
      >
        {value}
      </dd>
    </div>
  );
}

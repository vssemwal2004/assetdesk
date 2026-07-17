import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ContactRound } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';

import {
  CreateReceiverRequestSchema,
  type CreateReceiverRequest,
  type ReceiverType,
} from '@assetdesk/contracts';

import { SelectField } from '../../components/catalog-ui';
import { AppCard, Button, ErrorSummary, PageHeader, TextField } from '../../components/ui';
import { isApiError } from '../../lib/api-client';
import { humanizeCatalogValue } from '../../lib/catalog-format';
import { createReceiver } from '../../lib/receivers-api';

interface ReceiverForm {
  fullName: string;
  universityId: string;
  type: ReceiverType;
  department: string;
  contact: string;
  email: string;
}

const initialForm: ReceiverForm = {
  fullName: '',
  universityId: '',
  type: 'FACULTY',
  department: '',
  contact: '',
  email: '',
};

const receiverTypes: ReceiverType[] = [
  'FACULTY',
  'STAFF',
  'STUDENT',
  'DEPARTMENT',
  'AUTHORIZED_EXTERNAL',
];

export function CreateReceiverPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [form, setForm] = useState(initialForm);
  const [message, setMessage] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (input: CreateReceiverRequest) => createReceiver(input),
    onSuccess: async (receiver) => {
      await queryClient.invalidateQueries({ queryKey: ['receivers'] });
      navigate(`/receivers/${receiver.receiverCode}`, {
        replace: true,
        state: { notice: `${receiver.fullName} was added successfully.` },
      });
    },
    onError: (error) => {
      setMessage(isApiError(error) ? error.message : 'The Receiver could not be added.');
    },
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    const result = CreateReceiverRequestSchema.safeParse({
      fullName: form.fullName,
      ...(form.universityId.trim() ? { universityId: form.universityId } : {}),
      type: form.type,
      ...(form.department.trim() ? { department: form.department } : {}),
      contact: form.contact,
      email: form.email,
    });
    if (!result.success) {
      setMessage(result.error.issues[0]?.message ?? 'Check the Receiver details.');
      return;
    }
    mutation.mutate(result.data);
  }

  return (
    <div className="space-y-6">
      <PageHeader
        actions={
          <Link className="button-quiet" to="/receivers">
            <ArrowLeft aria-hidden="true" size={18} />
            Back to Receivers
          </Link>
        }
        description="Add an authorized person or department to the university Receiver directory."
        title="Add Receiver"
      />

      <AppCard className="max-w-3xl">
        <div className="mb-5 flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-xl bg-[var(--color-primary-soft)] text-[var(--color-primary)]">
            <ContactRound aria-hidden="true" size={22} />
          </span>
          <div>
            <h2 className="font-extrabold text-[var(--color-primary-strong)]">Receiver details</h2>
            <p className="text-sm text-[var(--color-text-muted)]">
              All contact details must be current.
            </p>
          </div>
        </div>
        {message ? <ErrorSummary message={message} /> : null}

        <form className="mt-5 space-y-5" noValidate onSubmit={submit}>
          <div className="grid gap-5 sm:grid-cols-2">
            <TextField
              autoComplete="name"
              label="Full name"
              onChange={(event) => setForm((value) => ({ ...value, fullName: event.target.value }))}
              required
              value={form.fullName}
            />
            <TextField
              label="University ID"
              onChange={(event) =>
                setForm((value) => ({ ...value, universityId: event.target.value }))
              }
              optional
              value={form.universityId}
            />
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            <SelectField
              id="receiver-type"
              label="Receiver type"
              onChange={(value) =>
                setForm((current) => ({ ...current, type: value as ReceiverType }))
              }
              value={form.type}
            >
              {receiverTypes.map((value) => (
                <option key={value} value={value}>
                  {humanizeCatalogValue(value)}
                </option>
              ))}
            </SelectField>
            <TextField
              label="Department"
              onChange={(event) =>
                setForm((value) => ({ ...value, department: event.target.value }))
              }
              optional
              value={form.department}
            />
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            <TextField
              autoComplete="tel"
              label="Contact number"
              onChange={(event) => setForm((value) => ({ ...value, contact: event.target.value }))}
              required
              type="tel"
              value={form.contact}
            />
            <TextField
              autoCapitalize="none"
              autoComplete="email"
              label="Email"
              onChange={(event) => setForm((value) => ({ ...value, email: event.target.value }))}
              required
              spellCheck={false}
              type="email"
              value={form.email}
            />
          </div>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Link className="button-secondary" to="/receivers">
              Cancel
            </Link>
            <Button loading={mutation.isPending} type="submit">
              {mutation.isPending ? 'Adding Receiver…' : 'Add Receiver'}
            </Button>
          </div>
        </form>
      </AppCard>
    </div>
  );
}

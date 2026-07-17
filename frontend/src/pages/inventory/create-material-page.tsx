import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, PackagePlus } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, useNavigate } from 'react-router';

import {
  CreateMaterialRequestSchema,
  type AssignmentType,
  type CreateMaterialRequest,
  type ReturnPolicy,
  type TrackingMode,
} from '@assetdesk/contracts';

import { SelectField } from '../../components/catalog-ui';
import { AppCard, Button, ErrorSummary, PageHeader, TextField } from '../../components/ui';
import { isApiError } from '../../lib/api-client';
import { createMaterial } from '../../lib/inventory-api';
import { MaterialCategoryField } from './material-category-field';

interface MaterialForm {
  name: string;
  category: string;
  description: string;
  trackingMode: TrackingMode;
  returnPolicy: ReturnPolicy;
  longTerm: boolean;
  shortTerm: boolean;
  totalQuantity: string;
  unitLabel: string;
}

const initialForm: MaterialForm = {
  name: '',
  category: '',
  description: '',
  trackingMode: 'QUANTITY',
  returnPolicy: 'REUSABLE',
  longTerm: true,
  shortTerm: true,
  totalQuantity: '0',
  unitLabel: 'units',
};

function assignmentTypes(form: MaterialForm): AssignmentType[] {
  return [
    ...(form.longTerm ? (['LONG_TERM'] as const) : []),
    ...(form.shortTerm ? (['SHORT_TERM'] as const) : []),
  ];
}

function firstIssueMessage(error: unknown): string {
  const fallback = 'Check the material details before saving.';
  if (!error || typeof error !== 'object' || !('issues' in error)) return fallback;
  const issues = (error as { issues?: Array<{ message?: string }> }).issues;
  return issues?.[0]?.message ?? fallback;
}

export function CreateMaterialPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [form, setForm] = useState(initialForm);
  const [message, setMessage] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: (input: CreateMaterialRequest) => createMaterial(input),
    onSuccess: async (material) => {
      await queryClient.invalidateQueries({ queryKey: ['inventory'] });
      navigate(`/inventory/${material.materialCode}`, {
        replace: true,
        state: { notice: `${material.name} was added to Inventory.` },
      });
    },
    onError: (error) => {
      setMessage(isApiError(error) ? error.message : 'The material could not be added.');
    },
  });

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);

    const base = {
      name: form.name,
      category: form.category,
      ...(form.description.trim() ? { description: form.description } : {}),
      assignmentTypes: assignmentTypes(form),
    };
    const draft =
      form.trackingMode === 'SERIALIZED'
        ? {
            ...base,
            trackingMode: 'SERIALIZED',
            returnPolicy: 'REUSABLE',
          }
        : {
            ...base,
            trackingMode: 'QUANTITY',
            returnPolicy: form.returnPolicy,
            totalQuantity: Number(form.totalQuantity),
            unitLabel: form.unitLabel,
          };

    const result = CreateMaterialRequestSchema.safeParse(draft);
    if (!result.success) {
      setMessage(firstIssueMessage(result.error));
      return;
    }
    mutation.mutate(result.data);
  }

  function setTrackingMode(value: TrackingMode) {
    setForm((current) => ({
      ...current,
      trackingMode: value,
      returnPolicy: value === 'SERIALIZED' ? 'REUSABLE' : current.returnPolicy,
    }));
  }

  return (
    <div className="space-y-6">
      <PageHeader
        actions={
          <Link className="button-quiet" to="/inventory">
            <ArrowLeft aria-hidden="true" size={18} />
            Back to Inventory
          </Link>
        }
        description="Create reusable, consumable, quantity-tracked or serialized material records."
        title="Add material"
      />

      <AppCard className="max-w-3xl">
        <div className="mb-5 flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-xl bg-[var(--color-primary-soft)] text-[var(--color-primary)]">
            <PackagePlus aria-hidden="true" size={22} />
          </span>
          <div>
            <h2 className="font-extrabold text-[var(--color-primary-strong)]">
              Material setup
            </h2>
            <p className="text-sm leading-6 text-[var(--color-text-muted)]">
              Serialized material starts with zero units. Add physical units from the material
              details page after saving.
            </p>
          </div>
        </div>
        {message ? <ErrorSummary message={message} /> : null}

        <form className="mt-5 space-y-5" noValidate onSubmit={submit}>
          <div className="grid gap-5 sm:grid-cols-2">
            <TextField
              label="Material name"
              onChange={(event) => setForm((value) => ({ ...value, name: event.target.value }))}
              required
              value={form.name}
            />
            <MaterialCategoryField
              id="material-category"
              onChange={(category) => setForm((value) => ({ ...value, category }))}
              value={form.category}
            />
          </div>

          <div className="space-y-1.5">
            <label className="field-label" htmlFor="material-description">
              Description <span className="font-medium text-[var(--color-text-muted)]">(optional)</span>
            </label>
            <textarea
              className="field-input min-h-24 resize-y"
              id="material-description"
              maxLength={1000}
              onChange={(event) =>
                setForm((value) => ({ ...value, description: event.target.value }))
              }
              value={form.description}
            />
          </div>

          <div className="grid gap-5 sm:grid-cols-2">
            <SelectField
              id="material-tracking-mode"
              label="Tracking type"
              onChange={(value) => setTrackingMode(value as TrackingMode)}
              value={form.trackingMode}
            >
              <option value="QUANTITY">Quantity tracked</option>
              <option value="SERIALIZED">Serialized assets</option>
            </SelectField>
            <SelectField
              disabled={form.trackingMode === 'SERIALIZED'}
              {...(form.trackingMode === 'SERIALIZED'
                ? { hint: 'Serialized assets are always reusable.' }
                : {})}
              id="material-return-policy"
              label="Return policy"
              onChange={(value) =>
                setForm((current) => ({ ...current, returnPolicy: value as ReturnPolicy }))
              }
              value={form.returnPolicy}
            >
              <option value="REUSABLE">Reusable</option>
              <option value="CONSUMABLE">Consumable</option>
            </SelectField>
          </div>

          <fieldset className="space-y-2">
            <legend className="field-label">Allowed assignment type</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              <label className="flex min-h-11 items-center gap-3 rounded-[10px] border border-[var(--color-border)] px-3 text-sm font-semibold text-[var(--color-text-strong)]">
                <input
                  checked={form.longTerm}
                  className="size-4 accent-[var(--color-primary)]"
                  onChange={(event) =>
                    setForm((value) => ({ ...value, longTerm: event.target.checked }))
                  }
                  type="checkbox"
                />
                Long-Term Assignment
              </label>
              <label className="flex min-h-11 items-center gap-3 rounded-[10px] border border-[var(--color-border)] px-3 text-sm font-semibold text-[var(--color-text-strong)]">
                <input
                  checked={form.shortTerm}
                  className="size-4 accent-[var(--color-primary)]"
                  onChange={(event) =>
                    setForm((value) => ({ ...value, shortTerm: event.target.checked }))
                  }
                  type="checkbox"
                />
                Short-Term Assignment
              </label>
            </div>
          </fieldset>

          {form.trackingMode === 'QUANTITY' ? (
            <div className="grid gap-5 sm:grid-cols-2">
              <TextField
                inputMode="numeric"
                label="Initial quantity"
                min="0"
                onChange={(event) =>
                  setForm((value) => ({ ...value, totalQuantity: event.target.value }))
                }
                required
                step="1"
                type="number"
                value={form.totalQuantity}
              />
              <TextField
                label="Unit label"
                onChange={(event) =>
                  setForm((value) => ({ ...value, unitLabel: event.target.value }))
                }
                placeholder="items, meters, boxes"
                required
                value={form.unitLabel}
              />
            </div>
          ) : null}

          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Link className="button-secondary" to="/inventory">
              Cancel
            </Link>
            <Button loading={mutation.isPending} type="submit">
              {mutation.isPending ? 'Adding material...' : 'Add material'}
            </Button>
          </div>
        </form>
      </AppCard>
    </div>
  );
}

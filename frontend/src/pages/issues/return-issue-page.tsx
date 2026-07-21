import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, CheckCircle2, RotateCcw } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router';

import {
  CreateReturnRequestSchema,
  type CreateReturnRequest,
  type IssueLine,
  type ReturnDisposition,
  type ReturnEvent,
} from '@assetdesk/contracts';

import { CatalogBadge, SelectField } from '../../components/catalog-ui';
import {
  AppCard,
  Button,
  ErrorState,
  ErrorSummary,
  LoadingPanel,
  PageHeader,
  SuccessMark,
  TextField,
} from '../../components/ui';
import { PendingSubmissionNotice, StickyWorkflowActions } from '../../components/workflow-ui';
import { isApiError } from '../../lib/api-client';
import { formatIstDateTime } from '../../lib/date-time';
import {
  clearPendingSubmission,
  createPendingSubmission,
  hasSameSubmissionInput,
  readPendingSubmission,
  savePendingSubmission,
  type PendingSubmission,
} from '../../lib/idempotent-submission';
import { returnedUnitCount } from '../../lib/issue-format';
import { createReturn, getIssue } from '../../lib/issues-api';

interface SelectedAssetReturn {
  lineId: string;
  disposition: ReturnDisposition;
  condition: string;
}

interface SelectedQuantityReturn {
  quantity: number;
  disposition: ReturnDisposition;
  condition: string;
}

const dispositions: ReturnDisposition[] = [
  'AVAILABLE',
  'RETURNED',
  'UNDER_REPAIR',
  'DAMAGED',
  'LOST',
  'SCRAPPED',
];

function returnSubmissionStorageKey(issueId: string): string {
  return `assetdesk:return-submission:v1:${issueId}`;
}

function readSavedReturnSubmission(
  storageKey: string,
): PendingSubmission<CreateReturnRequest> | null {
  const pending = readPendingSubmission(storageKey);
  if (!pending) return null;
  const input = CreateReturnRequestSchema.safeParse(pending.input);
  if (!input.success) {
    clearPendingSubmission(storageKey);
    return null;
  }
  return { ...pending, input: input.data };
}

export function ReturnIssuePage() {
  const { issueId = '' } = useParams();
  const submissionStorageKey = returnSubmissionStorageKey(issueId);
  const queryClient = useQueryClient();
  const [quantities, setQuantities] = useState<Record<string, SelectedQuantityReturn>>({});
  const [assets, setAssets] = useState<Record<string, SelectedAssetReturn>>({});
  const [notes, setNotes] = useState('');
  const [reviewing, setReviewing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [saved, setSaved] = useState<{ event: ReturnEvent; remaining: number } | null>(null);
  const [pendingSubmission, setPendingSubmission] =
    useState<PendingSubmission<CreateReturnRequest> | null>(() =>
      readSavedReturnSubmission(submissionStorageKey),
    );

  const query = useQuery({
    queryKey: ['issue', issueId],
    queryFn: ({ signal }) => getIssue(issueId, signal),
    enabled: Boolean(issueId),
  });

  const mutation = useMutation({
    mutationFn: ({ input, key }: { input: CreateReturnRequest; key: string }) =>
      createReturn(issueId, input, key),
    onSuccess: async (response) => {
      clearSavedSubmission();
      setSaved({
        event: response.data.returnEvent,
        remaining: response.data.issue.totalOutstandingQuantity,
      });
      const materialCodes = new Set(
        response.data.returnEvent.items.map((item) => item.materialCode),
      );
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['issue', issueId] }),
        queryClient.invalidateQueries({ queryKey: ['issues'] }),
        queryClient.invalidateQueries({ queryKey: ['returns'] }),
        queryClient.invalidateQueries({ queryKey: ['inventory'] }),
        queryClient.invalidateQueries({ queryKey: ['asset-units'] }),
        ...Array.from(materialCodes).map((code) =>
          queryClient.invalidateQueries({ queryKey: ['material', code] }),
        ),
      ]);
    },
    onError: async (error) => {
      if (isApiError(error) && error.status === 409) {
        clearSavedSubmission();
        setQuantities({});
        setAssets({});
        setReviewing(false);
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: ['issue', issueId] }),
          queryClient.invalidateQueries({ queryKey: ['issues'] }),
          queryClient.invalidateQueries({ queryKey: ['returns'] }),
          queryClient.invalidateQueries({ queryKey: ['inventory'] }),
        ]);
        await query.refetch();
        setMessage(
          'Outstanding material changed. The latest Issue Record was loaded; select the returned material again.',
        );
        return;
      }
      if (isApiError(error) && error.status >= 400 && error.status < 500 && error.status !== 408) {
        clearSavedSubmission();
      }
      setMessage(isApiError(error) ? error.message : 'The Return could not be recorded.');
    },
  });

  if (query.isPending) return <LoadingPanel label="Loading outstanding materials" />;
  if (query.isError || !query.data)
    return (
      <ErrorState
        message="The Issue Record could not be loaded for Return."
        onRetry={() => void query.refetch()}
        title="Return not available"
      />
    );
  const issue = query.data.data.issue;

  function clearSavedSubmission() {
    clearPendingSubmission(submissionStorageKey);
    setPendingSubmission(null);
  }

  function retryPendingSubmission() {
    if (!pendingSubmission) return;
    setMessage(null);
    mutation.mutate({ input: pendingSubmission.input, key: pendingSubmission.key });
  }

  if (saved) {
    return (
      <div className="mx-auto max-w-2xl">
        <AppCard>
          <SuccessMark label="Return saved" />
          <h1 className="mt-4 text-2xl font-extrabold text-[var(--color-primary-strong)]">
            Return recorded successfully
          </h1>
          <p className="mt-2 text-sm leading-6 text-[var(--color-text-muted)]">
            The Return and inventory movement were saved.
          </p>
          <dl className="mt-5 divide-y divide-[var(--color-border)] rounded-[12px] border border-[var(--color-border)] px-4">
            <SummaryRow label="Issue ID" value={issue.issueId} />
            <SummaryRow label="Returned at" value={formatIstDateTime(saved.event.returnedAt)} />
            <SummaryRow
              label="Returned units"
              value={String(returnedUnitCount(saved.event.items))}
            />
            <SummaryRow label="Remaining outstanding" value={String(saved.remaining)} />
          </dl>
          <div className="mt-6 flex flex-col gap-2 sm:flex-row">
            <Link className="button-primary" to={`/issues/${issue.issueId}`}>
              View Issue Record
            </Link>
            <Link
              className="button-secondary"
              to={`/bills/${issue.issueId}?type=return&returnEventId=${saved.event.returnEventId}`}
            >
              Return bill
            </Link>
            <Link className="button-secondary" to="/returns">
              <RotateCcw aria-hidden="true" size={18} />
              Return another
            </Link>
          </div>
        </AppCard>
      </div>
    );
  }

  if (issue.totalOutstandingQuantity <= 0 && !pendingSubmission) {
    return (
      <div className="mx-auto max-w-2xl">
        <AppCard>
          <SuccessMark label="No return pending" />
          <h1 className="mt-4 text-2xl font-extrabold text-[var(--color-primary-strong)]">
            No return is pending
          </h1>
          <p className="mt-2 text-sm leading-6 text-[var(--color-text-muted)]">
            {issue.lines.every((line) => line.material.returnPolicy === 'CONSUMABLE')
              ? 'This Issue contains consumable material. It was deducted from stock at issue time, so the user does not need to return it.'
              : 'All reusable material on this Issue Record has already been returned or closed.'}
          </p>
          <dl className="mt-5 divide-y divide-[var(--color-border)] rounded-[12px] border border-[var(--color-border)] px-4">
            <SummaryRow label="Issue ID" value={issue.issueId} />
            <SummaryRow label="Receiver" value={issue.receiver.fullName} />
            <SummaryRow label="Issued at" value={formatIstDateTime(issue.issuedAt)} />
            <SummaryRow label="Outstanding" value="0" />
          </dl>
          <div className="mt-6 flex flex-col gap-2 sm:flex-row">
            <Link className="button-primary" to={`/issues/${issue.issueId}`}>
              View Issue Record
            </Link>
            <Link className="button-secondary" to={`/bills/${issue.issueId}`}>
              Generate bill
            </Link>
            <Link className="button-secondary" to="/returns">
              Find another return
            </Link>
          </div>
        </AppCard>
      </div>
    );
  }

  const outstandingLines = issue.lines.filter((line) => line.outstandingQuantity > 0);
  const input = buildReturnInput(outstandingLines, quantities, assets, notes);
  const selectedCount = input.success
    ? input.data.items.reduce(
        (sum, item) => sum + (item.trackingMode === 'QUANTITY' ? item.quantity : 1),
        0,
      )
    : 0;
  const remaining = issue.totalOutstandingQuantity - selectedCount;

  function continueToReview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);
    if (!input.success) {
      setMessage(input.error.issues[0]?.message ?? 'Select at least one outstanding item.');
      return;
    }
    setReviewing(true);
  }

  function confirm() {
    setMessage(null);
    if (!input.success) {
      setMessage(input.error.issues[0]?.message ?? 'Check the Return details.');
      return;
    }
    if (pendingSubmission && !hasSameSubmissionInput(pendingSubmission, input.data)) {
      setMessage(
        'These details differ from the saved submission. Retry the exact saved request or explicitly discard it before starting again.',
      );
      return;
    }
    const pending = pendingSubmission ?? createPendingSubmission(input.data);
    if (!pendingSubmission) {
      savePendingSubmission(submissionStorageKey, pending);
      setPendingSubmission(pending);
    }
    mutation.mutate({ input: pending.input, key: pending.key });
  }

  return (
    <div className="space-y-6">
      <PageHeader
        actions={
          <Link className="button-quiet" to={`/issues/${issue.issueId}`}>
            <ArrowLeft aria-hidden="true" size={18} />
            Back to Issue Record
          </Link>
        }
        description={`${issue.receiver.fullName} · ${issue.totalOutstandingQuantity} items outstanding`}
        title={`Record Return · ${issue.issueId}`}
      />
      {pendingSubmission && !mutation.isPending ? (
        <PendingSubmissionNotice
          busy={mutation.isPending}
          description={`A saved request with ${returnedUnitCount(pendingSubmission.input.items)} returned ${returnedUnitCount(pendingSubmission.input.items) === 1 ? 'unit' : 'units'} can be retried with its original key. This is the safest option after a connection failure.`}
          noun="Return submission"
          onDiscard={() => {
            clearSavedSubmission();
            setReviewing(false);
            setMessage(
              'The saved retry was discarded. Review the Issue Record before returning again.',
            );
          }}
          onRetry={retryPendingSubmission}
        />
      ) : null}
      {issue.totalOutstandingQuantity > 0 ? (
        <AppCard className="mx-auto max-w-4xl">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-extrabold text-[var(--color-primary)]">
                {reviewing ? 'Review Return' : 'Select outstanding material'}
              </p>
              <h2 className="mt-1 text-lg font-extrabold text-[var(--color-primary-strong)]">
                {issue.receiver.fullName}
              </h2>
            </div>
            <CatalogBadge value={issue.status} />
          </div>
          {message ? (
            <div className="mt-5">
              <ErrorSummary message={message} />
            </div>
          ) : null}
          {reviewing && input.success ? (
            <ReturnReview
              input={input.data}
              issueLines={issue.lines}
              notes={notes}
              remaining={remaining}
            />
          ) : (
            <form className="mt-6 space-y-4" id="return-form" onSubmit={continueToReview}>
              {outstandingLines.map((line) => (
                <ReturnLine
                  assets={assets}
                  key={line.lineId}
                  line={line}
                  onAssetsChange={setAssets}
                  onQuantitiesChange={setQuantities}
                  quantities={quantities}
                />
              ))}
              <div className="space-y-1.5">
                <label className="field-label" htmlFor="return-notes">
                  Return notes{' '}
                  <span className="font-medium text-[var(--color-text-muted)]">(optional)</span>
                </label>
                <textarea
                  className="field-input min-h-24 resize-y"
                  id="return-notes"
                  maxLength={2000}
                  onChange={(event) => setNotes(event.target.value)}
                  value={notes}
                />
              </div>
            </form>
          )}
          <StickyWorkflowActions>
            {reviewing ? (
              <Button
                disabled={mutation.isPending}
                onClick={() => {
                  setReviewing(false);
                  setMessage(null);
                }}
                variant="secondary"
              >
                Back
              </Button>
            ) : (
              <Link className="button-secondary" to={`/issues/${issue.issueId}`}>
                Cancel
              </Link>
            )}
            {reviewing ? (
              <Button loading={mutation.isPending} onClick={confirm}>
                {mutation.isPending ? 'Returning…' : 'Confirm Return'}
              </Button>
            ) : (
              <Button form="return-form" type="submit">
                Continue to review
              </Button>
            )}
          </StickyWorkflowActions>
        </AppCard>
      ) : null}
    </div>
  );
}

function buildReturnInput(
  lines: IssueLine[],
  quantities: Record<string, SelectedQuantityReturn>,
  assets: Record<string, SelectedAssetReturn>,
  notes: string,
) {
  return CreateReturnRequestSchema.safeParse({
    items: [
      ...lines.flatMap((line) => {
        const selection = quantities[line.lineId];
        return line.material.trackingMode === 'QUANTITY' && selection
          ? [
              {
                trackingMode: 'QUANTITY' as const,
                lineId: line.lineId,
                quantity: selection.quantity,
                disposition: selection.disposition,
                condition: selection.condition,
              },
            ]
          : [];
      }),
      ...Object.entries(assets).map(([assetTag, selection]) => ({
        trackingMode: 'SERIALIZED' as const,
        lineId: selection.lineId,
        assetTag,
        disposition: selection.disposition,
        condition: selection.condition,
      })),
    ],
    ...(notes.trim() ? { notes } : {}),
  });
}

function ReturnLine({
  line,
  quantities,
  assets,
  onQuantitiesChange,
  onAssetsChange,
}: {
  line: IssueLine;
  quantities: Record<string, SelectedQuantityReturn>;
  assets: Record<string, SelectedAssetReturn>;
  onQuantitiesChange: (value: Record<string, SelectedQuantityReturn>) => void;
  onAssetsChange: (value: Record<string, SelectedAssetReturn>) => void;
}) {
  if (line.material.trackingMode === 'QUANTITY') {
    const selection = quantities[line.lineId];
    const selected = selection !== undefined;
    return (
      <article className="rounded-[12px] border border-[var(--color-border)] p-4">
        <label className="flex min-h-11 cursor-pointer items-start gap-3">
          <input
            checked={selected}
            className="mt-1 size-5 accent-[var(--color-primary)]"
            onChange={(event) => {
              const next = { ...quantities };
              if (event.target.checked)
                next[line.lineId] = {
                  quantity: line.outstandingQuantity,
                  disposition: 'AVAILABLE',
                  condition: 'Accepted',
                };
              else delete next[line.lineId];
              onQuantitiesChange(next);
            }}
            type="checkbox"
          />
          <span>
            <span className="block font-extrabold text-[var(--color-text-strong)]">
              {line.material.name}
            </span>
            <span className="mt-1 block text-sm text-[var(--color-text-muted)]">
              {line.outstandingQuantity} {line.material.unitLabel} outstanding
            </span>
          </span>
        </label>
        {selection ? (
          <div className="mt-4 grid gap-4 sm:grid-cols-3">
            <TextField
              inputMode="numeric"
              label="Return quantity"
              max={line.outstandingQuantity}
              min="1"
              onChange={(event) =>
                onQuantitiesChange({
                  ...quantities,
                  [line.lineId]: {
                    ...selection,
                    quantity: Math.max(
                      1,
                      Math.min(line.outstandingQuantity, Number(event.target.value) || 1),
                    ),
                  },
                })
              }
              type="number"
              value={selection.quantity}
            />
            <SelectField
              id={`quantity-disposition-${line.lineId}`}
              label="Return status"
              onChange={(value) =>
                onQuantitiesChange({
                  ...quantities,
                  [line.lineId]: { ...selection, disposition: value as ReturnDisposition },
                })
              }
              value={selection.disposition}
            >
              {dispositions.map((value) => (
                <option key={value} value={value}>
                  {value.toLowerCase().replaceAll('_', ' ')}
                </option>
              ))}
            </SelectField>
            <TextField
              label="Condition"
              onChange={(event) =>
                onQuantitiesChange({
                  ...quantities,
                  [line.lineId]: { ...selection, condition: event.target.value },
                })
              }
              required
              value={selection.condition}
            />
          </div>
        ) : null}
      </article>
    );
  }
  const outstandingAssets = line.assets.filter((asset) => asset.outstanding);
  return (
    <article className="rounded-[12px] border border-[var(--color-border)] p-4">
      <h3 className="font-extrabold text-[var(--color-text-strong)]">{line.material.name}</h3>
      <p className="mt-1 text-sm text-[var(--color-text-muted)]">
        Select each physical unit being returned.
      </p>
      <div className="mt-4 space-y-3">
        {outstandingAssets.map((asset) => {
          const selection = assets[asset.assetTag];
          return (
            <div className="rounded-[10px] bg-[var(--color-surface-tint)] p-3" key={asset.assetTag}>
              <label className="flex min-h-11 cursor-pointer items-start gap-3">
                <input
                  checked={Boolean(selection)}
                  className="mt-1 size-5 accent-[var(--color-primary)]"
                  onChange={(event) => {
                    const next = { ...assets };
                    if (event.target.checked)
                      next[asset.assetTag] = {
                        lineId: line.lineId,
                        disposition: 'AVAILABLE',
                        condition: '',
                      };
                    else delete next[asset.assetTag];
                    onAssetsChange(next);
                  }}
                  type="checkbox"
                />
                <span>
                  <span className="block font-bold text-[var(--color-text-strong)]">
                    {asset.assetTag}
                  </span>
                  <span className="mt-1 block text-xs text-[var(--color-text-muted)]">
                    {asset.serialNumber ?? 'No serial number'} · Issued as {asset.conditionAtIssue}
                  </span>
                </span>
              </label>
              {selection ? (
                <div className="mt-3 grid gap-4 sm:grid-cols-2">
                  <SelectField
                    id={`disposition-${asset.assetTag}`}
                    label="Disposition"
                    onChange={(value) =>
                      onAssetsChange({
                        ...assets,
                        [asset.assetTag]: { ...selection, disposition: value as ReturnDisposition },
                      })
                    }
                    value={selection.disposition}
                  >
                    {dispositions.map((value) => (
                      <option key={value} value={value}>
                        {value.toLowerCase().replaceAll('_', ' ')}
                      </option>
                    ))}
                  </SelectField>
                  <TextField
                    label="Condition on Return"
                    maxLength={120}
                    onChange={(event) =>
                      onAssetsChange({
                        ...assets,
                        [asset.assetTag]: { ...selection, condition: event.target.value },
                      })
                    }
                    required
                    value={selection.condition}
                  />
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </article>
  );
}

function ReturnReview({
  input,
  issueLines,
  notes,
  remaining,
}: {
  input: CreateReturnRequest;
  issueLines: IssueLine[];
  notes: string;
  remaining: number;
}) {
  const materialName = (lineId: string) =>
    issueLines.find((line) => line.lineId === lineId)?.material.name ?? 'Material';
  return (
    <div className="mt-6">
      <div
        className={`rounded-[12px] p-4 ${remaining === 0 ? 'bg-[var(--color-success-soft)] text-[var(--color-success)]' : 'bg-[var(--color-warning-soft)] text-[var(--color-warning)]'}`}
        role="status"
      >
        <div className="flex gap-2">
          <CheckCircle2 aria-hidden="true" className="shrink-0" size={20} />
          <p className="font-extrabold">
            {remaining === 0
              ? 'This completes the Issue Record'
              : `${remaining} ${remaining === 1 ? 'item will' : 'items will'} remain outstanding`}
          </p>
        </div>
      </div>
      <ul className="mt-4 divide-y divide-[var(--color-border)] rounded-[12px] border border-[var(--color-border)] px-4">
        {input.items.map((item) => (
          <li className="py-3" key={item.trackingMode === 'QUANTITY' ? item.lineId : item.assetTag}>
            <p className="font-bold text-[var(--color-text-strong)]">{materialName(item.lineId)}</p>
            <p className="mt-1 text-sm text-[var(--color-text-muted)]">
              {item.trackingMode === 'QUANTITY'
                ? `Return quantity: ${item.quantity} · ${item.disposition.toLowerCase().replaceAll('_', ' ')} · ${item.condition}`
                : `${item.assetTag} · ${item.disposition.toLowerCase().replaceAll('_', ' ')} · ${item.condition}`}
            </p>
          </li>
        ))}
      </ul>
      {notes ? (
        <div className="mt-4 rounded-[12px] bg-[var(--color-surface-tint)] p-4">
          <p className="text-xs font-bold text-[var(--color-text-muted)]">Return notes</p>
          <p className="mt-2 text-sm text-[var(--color-text-strong)]">{notes}</p>
        </div>
      ) : null}
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-1 py-3 sm:grid-cols-[160px_1fr]">
      <dt className="text-sm font-bold text-[var(--color-text-muted)]">{label}</dt>
      <dd className="text-sm font-bold text-[var(--color-text-strong)]">{value}</dd>
    </div>
  );
}

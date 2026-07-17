import { AlertTriangle, Check, RotateCcw, Trash2 } from 'lucide-react';
import { useState, type ReactNode } from 'react';

import { Button, cn } from './ui';

export function WorkflowSteps({ current, labels }: { current: number; labels: readonly string[] }) {
  return (
    <div aria-label={`Step ${current} of ${labels.length}: ${labels[current - 1]}`}>
      <p className="text-xs font-extrabold text-[var(--color-primary)]">
        Step {current} of {labels.length} · {labels[current - 1]}
      </p>
      <ol
        className="mt-3 grid gap-2"
        style={{ gridTemplateColumns: `repeat(${labels.length}, 1fr)` }}
      >
        {labels.map((label, index) => {
          const number = index + 1;
          const complete = number < current;
          const active = number === current;
          return (
            <li className="min-w-0" key={label}>
              <div
                aria-current={active ? 'step' : undefined}
                className={cn(
                  'h-1.5 rounded-full',
                  number <= current ? 'bg-[var(--color-primary)]' : 'bg-[var(--color-border)]',
                )}
              />
              <span
                className={cn(
                  'mt-2 hidden items-center gap-1.5 truncate text-xs font-bold sm:flex',
                  active ? 'text-[var(--color-primary-strong)]' : 'text-[var(--color-text-muted)]',
                )}
              >
                {complete ? <Check aria-hidden="true" size={14} /> : null}
                {label}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}

export function StickyWorkflowActions({ children }: { children: ReactNode }) {
  return (
    <div className="sticky bottom-[calc(68px+env(safe-area-inset-bottom))] z-20 -mx-4 mt-6 border-t border-[var(--color-border)] bg-white/95 px-4 py-3 backdrop-blur-md min-[600px]:static min-[600px]:mx-0 min-[600px]:border-0 min-[600px]:bg-transparent min-[600px]:px-0 min-[600px]:py-0">
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">{children}</div>
    </div>
  );
}

export function PendingSubmissionNotice({
  busy,
  description,
  noun,
  onDiscard,
  onRetry,
}: {
  busy: boolean;
  description: string;
  noun: string;
  onDiscard: () => void;
  onRetry: () => void;
}) {
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  return (
    <section
      aria-labelledby="pending-submission-heading"
      className="rounded-[14px] border border-amber-300 bg-[var(--color-warning-soft)] p-4"
    >
      <div className="flex items-start gap-3">
        <AlertTriangle
          aria-hidden="true"
          className="mt-0.5 shrink-0 text-[var(--color-warning)]"
          size={21}
        />
        <div className="min-w-0 flex-1">
          <h2
            className="font-extrabold text-[var(--color-text-strong)]"
            id="pending-submission-heading"
          >
            Previous {noun} result is unconfirmed
          </h2>
          <p className="mt-1 text-sm leading-6 text-[var(--color-text-muted)]">{description}</p>
          {!confirmDiscard ? (
            <div className="mt-4 flex flex-col gap-2 sm:flex-row">
              <Button disabled={busy} onClick={onRetry}>
                <RotateCcw aria-hidden="true" size={18} />
                Retry exact submission
              </Button>
              <Button disabled={busy} onClick={() => setConfirmDiscard(true)} variant="secondary">
                Discard saved retry
              </Button>
            </div>
          ) : (
            <div className="mt-4 rounded-[12px] border border-red-200 bg-white p-3">
              <p className="text-sm font-bold text-[var(--color-danger)]">
                First check the Issue Records. If the earlier request was saved, starting again can
                create a duplicate.
              </p>
              <div className="mt-3 flex flex-col gap-2 sm:flex-row">
                <Button onClick={() => setConfirmDiscard(false)} variant="secondary">
                  Keep saved retry
                </Button>
                <Button onClick={onDiscard} variant="danger">
                  <Trash2 aria-hidden="true" size={18} />
                  Discard anyway
                </Button>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}

import { ClipboardCheck, Pencil, X } from 'lucide-react';
import { useEffect, useId, useRef, type ReactNode } from 'react';

import type { ReviewSection } from '../lib/review-rows';
import { Button, ErrorSummary } from './ui';

/**
 * Shows every detail of a pending save before it is committed, so a wrong model, store,
 * receiver or serial number is caught before it has to be corrected afterwards.
 * Opens as a right-hand drawer on wide screens and a full-height sheet on phones.
 */
export function ReviewDrawer({
  title,
  description,
  sections,
  confirmLabel,
  pendingLabel = 'Saving…',
  pending = false,
  error,
  warning,
  onConfirm,
  onClose,
}: {
  title: string;
  description?: string;
  sections: ReviewSection[];
  confirmLabel: string;
  pendingLabel?: string;
  pending?: boolean;
  error?: string | null;
  warning?: ReactNode;
  onConfirm: () => void;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const headingId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    return () => {
      if (dialog?.open) dialog.close();
    };
  }, []);

  function close() {
    // Keep the drawer open while saving so the result is not lost.
    if (!pending) onClose();
  }

  return (
    <dialog
      aria-labelledby={headingId}
      className="review-drawer"
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
      ref={dialogRef}
    >
      <div className="flex h-full flex-col">
        <header className="flex items-start gap-3 border-b border-[var(--color-border)] px-5 py-4">
          <span className="grid size-11 shrink-0 place-items-center rounded-[12px] bg-[var(--color-primary-soft)] text-[var(--color-primary)]">
            <ClipboardCheck aria-hidden="true" size={22} />
          </span>
          <div className="min-w-0 flex-1">
            <h2
              className="text-lg font-extrabold text-[var(--color-primary-strong)]"
              id={headingId}
            >
              {title}
            </h2>
            {description ? (
              <p className="mt-0.5 text-sm text-[var(--color-text-muted)]">{description}</p>
            ) : null}
          </div>
          <button
            aria-label="Close review"
            className="icon-button"
            disabled={pending}
            onClick={close}
            type="button"
          >
            <X aria-hidden="true" size={20} />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5">
          {sections.map((section) => (
            <section className="review-section py-4" key={section.title}>
              <h3 className="text-[11px] font-extrabold uppercase tracking-[0.08em] text-[var(--color-text-muted)]">
                {section.title}
              </h3>
              {section.rows?.length ? (
                <dl className="mt-2">
                  {section.rows.map((row) => (
                    <div className="review-row" key={row.label}>
                      <dt>{row.label}</dt>
                      <dd>{row.value}</dd>
                    </div>
                  ))}
                </dl>
              ) : null}
              {section.content ? <div className="mt-2">{section.content}</div> : null}
            </section>
          ))}
        </div>

        <footer className="space-y-3 border-t border-[var(--color-border)] bg-[var(--color-surface-tint)] px-5 py-4">
          {warning ? (
            <p
              className="rounded-[10px] border border-amber-300 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900"
              role="status"
            >
              {warning}
            </p>
          ) : null}
          {error ? <ErrorSummary message={error} /> : null}
          <p className="text-xs leading-5 text-[var(--color-text-muted)]">
            Check every value. Nothing is saved until you confirm.
          </p>
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <Button disabled={pending} onClick={close} type="button" variant="secondary">
              <Pencil aria-hidden="true" size={16} />
              Back to edit
            </Button>
            <Button loading={pending} onClick={onConfirm} type="button">
              {pending ? pendingLabel : confirmLabel}
            </Button>
          </div>
        </footer>
      </div>
    </dialog>
  );
}

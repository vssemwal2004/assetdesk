import type { ReactNode } from 'react';

import { humanizeCatalogValue } from '../lib/catalog-format';
import { cn } from './ui';

const badgeBase = 'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold';

export function CatalogBadge({ value }: { value: string }) {
  const positive = ['ACTIVE', 'AVAILABLE', 'RETURNED', 'CONSUMED'].includes(value);
  const negative = [
    'ARCHIVED',
    'INACTIVE',
    'SCRAP',
    'FAULTY',
    'DAMAGED',
    'LOST',
    'RETIRED',
    'CANCELLED',
    'OVERDUE',
  ].includes(value);
  const warning = [
    'ISSUED',
    'UNDER_REPAIR',
    'PARTIALLY_RETURNED',
    'DUE_SOON',
    'NOT_IN_USE',
    'OUTDATED',
  ].includes(value);

  return (
    <span
      className={cn(
        badgeBase,
        positive && 'bg-[var(--color-success-soft)] text-[var(--color-success)]',
        negative && 'bg-[var(--color-danger-soft)] text-[var(--color-danger)]',
        warning && 'bg-[var(--color-warning-soft)] text-[var(--color-warning)]',
        !positive &&
          !negative &&
          !warning &&
          'bg-[var(--color-primary-soft)] text-[var(--color-primary-strong)]',
      )}
    >
      <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
      {humanizeCatalogValue(value)}
    </span>
  );
}

export function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="grid gap-1 py-3 sm:grid-cols-[160px_minmax(0,1fr)] sm:gap-4">
      <dt className="text-sm font-bold text-[var(--color-text-muted)]">{label}</dt>
      <dd className="break-words text-sm font-semibold text-[var(--color-text-strong)]">{value}</dd>
    </div>
  );
}

export function SelectField({
  id,
  label,
  value,
  onChange,
  children,
  hint,
  disabled = false,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (value: string) => void;
  children: ReactNode;
  hint?: string;
  disabled?: boolean;
}) {
  const hintId = `${id}-hint`;
  return (
    <div className="space-y-1.5">
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      <select
        aria-describedby={hint ? hintId : undefined}
        className="field-input"
        disabled={disabled}
        id={id}
        onChange={(event) => onChange(event.target.value)}
        value={value}
      >
        {children}
      </select>
      {hint ? (
        <p className="text-xs leading-5 text-[var(--color-text-muted)]" id={hintId}>
          {hint}
        </p>
      ) : null}
    </div>
  );
}

export function PageCount({ count, noun }: { count: number; noun: string }) {
  return (
    <p className="mt-3 text-xs font-semibold text-[var(--color-text-muted)]" role="status">
      {count} {count === 1 ? noun : `${noun}s`} found
    </p>
  );
}

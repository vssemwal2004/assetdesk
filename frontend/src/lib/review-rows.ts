import type { ReactNode } from 'react';

export interface ReviewRow {
  label: string;
  value: ReactNode;
}

export interface ReviewSection {
  title: string;
  rows?: ReviewRow[];
  /** Free-form content, e.g. a list of serial numbers or issue lines. */
  content?: ReactNode;
}

/** Drops rows with no value so the review only lists what will actually be saved. */
export function reviewRows(rows: Array<ReviewRow | false | null | undefined>): ReviewRow[] {
  return rows.filter(
    (row): row is ReviewRow =>
      Boolean(row) &&
      (row as ReviewRow).value !== null &&
      (row as ReviewRow).value !== undefined &&
      (row as ReviewRow).value !== '',
  );
}

import type { DueSelection } from '@assetdesk/contracts';

import { AppError } from '../../middleware/error-handler.js';

const IST_OFFSET_MILLISECONDS = (5 * 60 + 30) * 60 * 1_000;

function istWallClock(date: Date): Date {
  return new Date(date.getTime() + IST_OFFSET_MILLISECONDS);
}

function fromIstWallClock(date: Date): Date {
  return new Date(date.getTime() - IST_OFFSET_MILLISECONDS);
}

function addCalendarMonthsInIst(date: Date, months: number): Date {
  const wall = istWallClock(date);
  const originalDay = wall.getUTCDate();
  const absoluteMonth = wall.getUTCFullYear() * 12 + wall.getUTCMonth() + months;
  const targetYear = Math.floor(absoluteMonth / 12);
  const targetMonth = ((absoluteMonth % 12) + 12) % 12;
  const finalDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  wall.setUTCFullYear(targetYear, targetMonth, Math.min(originalDay, finalDay));
  return fromIstWallClock(wall);
}

function addCalendarDaysInIst(date: Date, days: number): Date {
  const wall = istWallClock(date);
  wall.setUTCDate(wall.getUTCDate() + days);
  return fromIstWallClock(wall);
}

export function issueYearInIst(date: Date): number {
  return istWallClock(date).getUTCFullYear();
}

export function istDayRange(date: Date): { start: Date; end: Date } {
  const wall = istWallClock(date);
  const startWall = new Date(
    Date.UTC(wall.getUTCFullYear(), wall.getUTCMonth(), wall.getUTCDate()),
  );
  const start = fromIstWallClock(startWall);
  return { start, end: new Date(start.getTime() + 24 * 60 * 60 * 1_000) };
}

export function calculateExpectedReturnAt(issuedAt: Date, due: DueSelection): Date {
  let expectedReturnAt: Date;
  switch (due.preset) {
    case 'ONE_DAY':
      expectedReturnAt = addCalendarDaysInIst(issuedAt, 1);
      break;
    case 'ONE_WEEK':
      expectedReturnAt = addCalendarDaysInIst(issuedAt, 7);
      break;
    case 'ONE_MONTH':
      expectedReturnAt = addCalendarMonthsInIst(issuedAt, 1);
      break;
    case 'SIX_MONTHS':
      expectedReturnAt = addCalendarMonthsInIst(issuedAt, 6);
      break;
    case 'ONE_YEAR':
      expectedReturnAt = addCalendarMonthsInIst(issuedAt, 12);
      break;
    case 'CUSTOM':
      expectedReturnAt = new Date(due.expectedReturnAt);
      break;
  }

  if (!Number.isFinite(expectedReturnAt.getTime()) || expectedReturnAt <= issuedAt) {
    throw new AppError(
      400,
      'EXPECTED_RETURN_MUST_BE_FUTURE',
      'The expected return date must be after the issue date and time.',
      { due: 'Choose a future return date.' },
    );
  }
  return expectedReturnAt;
}

const dateTimeFormatter = new Intl.DateTimeFormat('en-IN', {
  dateStyle: 'medium',
  timeStyle: 'short',
  timeZone: 'Asia/Kolkata',
});

const dateFormatter = new Intl.DateTimeFormat('en-IN', {
  dateStyle: 'medium',
  timeZone: 'Asia/Kolkata',
});

const istOffsetMilliseconds = (5 * 60 + 30) * 60 * 1_000;

function istWallClock(date: Date): Date {
  return new Date(date.getTime() + istOffsetMilliseconds);
}

function fromIstWallClock(date: Date): Date {
  return new Date(date.getTime() - istOffsetMilliseconds);
}

function addCalendarDaysInIst(date: Date, days: number): Date {
  const wallClock = istWallClock(date);
  wallClock.setUTCDate(wallClock.getUTCDate() + days);
  return fromIstWallClock(wallClock);
}

function addCalendarMonthsInIst(date: Date, months: number): Date {
  const wallClock = istWallClock(date);
  const originalDay = wallClock.getUTCDate();
  const absoluteMonth = wallClock.getUTCFullYear() * 12 + wallClock.getUTCMonth() + months;
  const targetYear = Math.floor(absoluteMonth / 12);
  const targetMonth = ((absoluteMonth % 12) + 12) % 12;
  const finalDay = new Date(Date.UTC(targetYear, targetMonth + 1, 0)).getUTCDate();
  wallClock.setUTCFullYear(targetYear, targetMonth, Math.min(originalDay, finalDay));
  return fromIstWallClock(wallClock);
}

export type ReturnPeriodPreset = 'ONE_DAY' | 'ONE_WEEK' | 'ONE_MONTH' | 'SIX_MONTHS' | 'ONE_YEAR';

export function calculatePresetReturnInIst(issuedAt: Date, preset: ReturnPeriodPreset): Date {
  switch (preset) {
    case 'ONE_DAY':
      return addCalendarDaysInIst(issuedAt, 1);
    case 'ONE_WEEK':
      return addCalendarDaysInIst(issuedAt, 7);
    case 'ONE_MONTH':
      return addCalendarMonthsInIst(issuedAt, 1);
    case 'SIX_MONTHS':
      return addCalendarMonthsInIst(issuedAt, 6);
    case 'ONE_YEAR':
      return addCalendarMonthsInIst(issuedAt, 12);
  }
}

export function formatIstDateTime(value: string | Date | null): string {
  if (!value) return 'Not applicable';
  return `${dateTimeFormatter.format(new Date(value))} IST`;
}

export function formatIstDate(value: string | Date | null): string {
  if (!value) return 'Not applicable';
  return `${dateFormatter.format(new Date(value))} IST`;
}

export function toLocalDateTimeInput(value: Date): string {
  const local = new Date(value.getTime() - value.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

export function toIstDateTimeInput(value: Date): string {
  return istWallClock(value).toISOString().slice(0, 16);
}

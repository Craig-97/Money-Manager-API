import type { PaymentFrequency } from '../../constants/payment';

export const DAY_MS = 24 * 60 * 60 * 1000;

// Months between occurrences for the month-based frequencies
const MONTH_STEPS: Partial<Record<PaymentFrequency, number>> = {
  MONTHLY: 1,
  QUARTERLY: 3,
  BIANNUALLY: 6,
  ANNUALLY: 12
};

// Days between occurrences for the week-based frequencies
const DAY_STEPS: Partial<Record<PaymentFrequency, number>> = {
  WEEKLY: 7,
  BIWEEKLY: 14
};

// Enough occurrences to cover a weekly payment for well over a century
const MAX_OCCURRENCES = 10_000;

export interface Schedule {
  firstPaymentDate: Date;
  frequency: PaymentFrequency;
  lastPaymentDate?: Date | null;
}

/* Midnight UTC on the given day in the UK, which is how dates sent as YYYY-MM-DD are stored */
export const ukDay = (date: Date = new Date()) => {
  const [day, month, year] = date
    .toLocaleDateString('en-GB', { timeZone: 'Europe/London' })
    .split('/')
    .map(Number);
  return new Date(Date.UTC(year, month - 1, day));
};

export const addDays = (date: Date, days: number) => new Date(date.getTime() + days * DAY_MS);

/* A day as 'YYYY-MM-DD', and back to midnight UTC on it */
export const toIsoDay = (date: Date) => date.toISOString().slice(0, 10);
export const fromIsoDay = (value: string) => new Date(`${value}T00:00:00Z`);

/* The given day in a month, or the month's last day when it's shorter: the 31st falls on 28 Feb */
export const dayInMonth = ({ year, month, day }: { year: number; month: number; day: number }) => {
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(day, lastDay)));
};

/* Whole days from one day to another, negative when it's earlier */
export const daysBetween = (from: Date, to: Date) =>
  Math.round((to.getTime() - from.getTime()) / DAY_MS);

/*
 * The kth date a payment falls on, counting the first as 0. Month-based payments keep the first
 * date's day, moving to the end of shorter months: the 31st falls on 28 Feb, then 31 Mar.
 */
export const occurrence = (first: Date, frequency: PaymentFrequency, k: number) => {
  const days = DAY_STEPS[frequency];
  if (days) return addDays(first, days * k);

  const months = (MONTH_STEPS[frequency] ?? 1) * k;
  return dayInMonth({
    year: first.getUTCFullYear(),
    month: first.getUTCMonth() + months,
    day: first.getUTCDate()
  });
};

/* The first date the payment falls on that is on or after `from`, or null once it has ended */
export const nextOccurrence = (
  { firstPaymentDate, frequency, lastPaymentDate }: Schedule,
  from: Date
) => {
  for (let k = 0; k < MAX_OCCURRENCES; k++) {
    const date = occurrence(firstPaymentDate, frequency, k);
    if (lastPaymentDate && date > lastPaymentDate) return null;
    if (date >= from) return date;
  }
  return null;
};

/* The date the payment fell on before `date`, or null when `date` is its first */
export const previousOccurrence = ({ firstPaymentDate, frequency }: Schedule, date: Date) => {
  let previous: Date | null = null;
  for (let k = 0; k < MAX_OCCURRENCES; k++) {
    const next = occurrence(firstPaymentDate, frequency, k);
    if (next >= date) return previous;
    previous = next;
  }
  return previous;
};

/* Every date the payment falls on from `from` up to, but not including, `until` */
export const occurrencesBefore = (schedule: Schedule, from: Date, until: Date) => {
  const dates: Date[] = [];
  for (
    let date = nextOccurrence(schedule, from);
    date && date < until;
    date = nextOccurrence(schedule, addDays(date, 1))
  ) {
    dates.push(date);
  }
  return dates;
};

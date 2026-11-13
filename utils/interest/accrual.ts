import { daysBetween } from '../dates/recurrence';

/*
 * Interest worked out each day: every day's closing balance earns, or costs, a day's interest. What's
 * built up so far is kept unrounded with the first day not yet counted, and is counted up to the
 * day of any change to the balance or rate, so each day uses the figures it closed with. It's
 * rounded only when it's added to the balance.
 */
export interface Accrual {
  accrued: number;
  // The first day not yet counted
  accruedTo: Date;
}

/* A day's interest on savings: the AER spread over the year, compounding, as banks pay it */
export const savingsDailyInterest = (balance: number, rate: number) =>
  Math.max(0, balance) * ((1 + rate / 100) ** (1 / 365) - 1);

/* A day's interest on a debt: the APR spread evenly over the year */
export const debtDailyInterest = (balance: number, apr: number) =>
  (Math.max(0, balance) * apr) / 100 / 365;

/* What's built up by the start of `to`, at a day's interest from where it was counted to */
export const accrue = ({ accrued, accruedTo }: Accrual, { daily, to }: { daily: number; to: Date }) =>
  to <= accruedTo
    ? { accrued, accruedTo }
    : { accrued: accrued + daily * daysBetween(accruedTo, to), accruedTo: to };

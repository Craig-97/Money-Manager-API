import { ukDay } from '../dates/recurrence';

// Money is kept in pounds, so sums are rounded back to whole pence
export const roundPence = (amount: number) => Math.round(amount * 100) / 100;

/*
 * A debt as stored when its balance is set by hand: dated now, so the app can say how old it is.
 * It's from a statement that already includes the interest so far, so interest builds up afresh
 * from today.
 */
export const withBalanceDate = <T extends object>(debt: T | null | undefined) =>
  debt ? { ...debt, balanceUpdatedAt: new Date(), accrued: 0, accruedTo: ukDay() } : undefined;

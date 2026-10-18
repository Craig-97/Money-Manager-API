import { PaymentFrequency } from '../../constants/payment';

// Money is kept in pounds, so sums are rounded back to whole pence
export const roundPence = (amount: number) => Math.round(amount * 100) / 100;

// How many times a year a payment of each frequency is due
export const PAYMENTS_PER_YEAR: Record<PaymentFrequency, number> = {
  WEEKLY: 52,
  BIWEEKLY: 26,
  MONTHLY: 12,
  QUARTERLY: 4,
  BIANNUALLY: 2,
  ANNUALLY: 1
};

/*
 * What one payment does to a debt. Interest for the period builds up first and the payment comes
 * off after, so a payment smaller than the interest leaves more owed. The interest is an estimate
 * from the APR; correcting the balance from a statement makes it exact. Never goes below nothing.
 */
export const payTowardsDebt = (
  debt: { balance: number; apr: number },
  amount: number,
  frequency: PaymentFrequency
) => {
  const interest = roundPence((debt.balance * debt.apr) / 100 / PAYMENTS_PER_YEAR[frequency]);
  const balance = Math.max(0, roundPence(debt.balance + interest - amount));
  return { balance, interest, reduction: roundPence(debt.balance - balance) };
};

// A debt as stored when its balance is set by hand: dated now, so the app can say how old it is
export const withBalanceDate = <T extends object>(debt: T | null | undefined) =>
  debt ? { ...debt, balanceUpdatedAt: new Date() } : undefined;

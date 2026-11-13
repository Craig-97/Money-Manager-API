import type { PaymentFrequency } from '../../constants/payment';
import type { RecordDebt } from '../../models/payment/PaymentRecord';
import type { Debt } from '../../models/payment/RecurringPayment';
import { previousOccurrence, ukDay } from '../dates/recurrence';
import { roundPence } from '../helpers/moneyHelpers';
import { accrue, debtDailyInterest } from './accrual';

interface DebtPayment {
  amount: number;
  frequency: PaymentFrequency;
  firstPaymentDate: Date;
  nextDueDate?: Date | null;
  debt?: Debt | null;
}

/*
 * Where a debt's interest counts from: as far as it's been counted, else the payment before the
 * next one or when the balance was set, whichever is later
 */
export const debtAccruedTo = (payment: DebtPayment) => {
  const { debt } = payment;
  if (debt?.accruedTo) return debt.accruedTo;
  const set = debt?.balanceUpdatedAt ? ukDay(debt.balanceUpdatedAt) : null;
  const previous = payment.nextDueDate ? previousOccurrence(payment, payment.nextDueDate) : null;
  if (set && previous) return set > previous ? set : previous;
  return set ?? previous ?? ukDay();
};

/* Counts a debt's interest up to the start of a day, at the balance and APR it has now */
export const accrueDebt = (payment: DebtPayment, to: Date = ukDay()) => {
  const { debt } = payment;
  if (!debt) return;
  const next = accrue(
    { accrued: debt.accrued ?? 0, accruedTo: debtAccruedTo(payment) },
    { daily: debtDailyInterest(debt.balance, debt.apr), to }
  );
  debt.accrued = next.accrued;
  debt.accruedTo = next.accruedTo;
};

/*
 * Payments towards a debt on their dates, in order, even when they're marked paid later: each adds
 * the interest built up to its date, then comes off. Never goes below nothing. The record keeps
 * what had built up before, so undoing puts it back.
 */
export const payDebtOn = (payment: DebtPayment, dates: Date[]): RecordDebt => {
  const debt = payment.debt!;
  const before = { accruedBefore: debt.accrued ?? 0, accruedToBefore: debt.accruedTo ?? null };
  const start = debt.balance;
  let interest = 0;
  for (const date of dates) {
    accrueDebt(payment, date);
    const added = roundPence(debt.accrued ?? 0);
    interest += added;
    debt.balance = Math.max(0, roundPence(debt.balance + added - payment.amount));
    debt.accrued = 0;
  }
  return {
    interest: roundPence(interest),
    reduction: roundPence(start - debt.balance),
    balanceAfter: debt.balance,
    ...before
  };
};

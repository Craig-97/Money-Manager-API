import type { AccountInterest } from '../../models/account/Account';
import type { Debt } from '../../models/payment/RecurringPayment';
import type { PaymentFrequency } from '../../constants/payment';
import { previousInterestDate } from '../dates/interest';
import { previousOccurrence, ukDay } from '../dates/recurrence';
import { roundPence } from '../helpers/moneyHelpers';
import { accrue, debtDailyInterest, savingsDailyInterest } from './accrual';

interface SavingsAccount {
  balance: number;
  balanceUpdatedAt: Date;
  interest?: AccountInterest | null;
}

/*
 * Where savings interest counts from: as far as it's been counted, else the last payment, else when
 * the balance was set (a fixed term, which pays once)
 */
export const savingsAccruedTo = ({ interest, balanceUpdatedAt }: SavingsAccount) => {
  if (interest?.accruedTo) return interest.accruedTo;
  const previous =
    interest?.frequency && interest.nextDate
      ? previousInterestDate(
          { frequency: interest.frequency, day: interest.day ?? interest.nextDate.getUTCDate() },
          interest.nextDate
        )
      : null;
  return previous ?? ukDay(balanceUpdatedAt);
};

/*
 * Counts savings interest up to the start of a day, at the balance and rate it has now: run before
 * either changes, so each day uses the figures it closed with. Only interest that's paid builds up.
 */
export const accrueSavings = (account: SavingsAccount, to: Date = ukDay()) => {
  const { interest } = account;
  if (!interest?.frequency) return;
  const next = accrue(
    { accrued: interest.accrued ?? 0, accruedTo: savingsAccruedTo(account) },
    { daily: savingsDailyInterest(account.balance, interest.rate), to }
  );
  interest.accrued = next.accrued;
  interest.accruedTo = next.accruedTo;
};

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

/* A debt's balance set by hand, from a statement that already includes the interest so far */
export const restartDebtInterest = (debt: Debt) => {
  debt.accrued = 0;
  debt.accruedTo = ukDay();
};

/*
 * One payment towards a debt on its date, even when it's marked paid later: the interest built up
 * to that date is added, then the payment comes off. Never goes below nothing. What was built up
 * before is kept, so undoing puts it back.
 */
export const payDebtOn = (payment: DebtPayment & { debt: Debt }, date: Date) => {
  const { debt } = payment;
  accrueDebt(payment, date);
  const interest = roundPence(debt.accrued ?? 0);
  const balance = Math.max(0, roundPence(debt.balance + interest - payment.amount));
  const reduction = roundPence(debt.balance - balance);
  debt.balance = balance;
  debt.accrued = 0;
  return { interest, reduction, balanceAfter: balance };
};

/* What a debt had built up, for its record, so undoing puts it back */
export const accrualBefore = (debt: Debt) => ({
  accruedBefore: debt.accrued ?? 0,
  accruedToBefore: debt.accruedTo ?? null
});

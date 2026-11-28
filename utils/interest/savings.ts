import type { AccountInterest } from '../../models/account/Account';
import { followingInterestDate, previousInterestDate } from '../dates/interest';
import { ukDay } from '../dates/recurrence';
import { roundPence } from '../helpers/moneyHelpers';
import { accrue, savingsDailyInterest } from './accrual';

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
  const { rate, frequency } = interest;
  const next = accrue(
    { accrued: interest.accrued ?? 0, accruedTo: savingsAccruedTo(account) },
    { daily: savingsDailyInterest(account.balance, { rate, frequency }), to }
  );
  interest.accrued = next.accrued;
  interest.accruedTo = next.accruedTo;
};

/*
 * Adds each interest payment that's come, oldest first, on its own date: what built up to it,
 * rounded. Each one is kept for the user to check against their bank, and the next date moves on;
 * a fixed term stops once it has matured. Returns whether any came.
 */
export const addDueInterest = (account: SavingsAccount, today: Date = ukDay()) => {
  const { interest } = account;
  let came = false;
  while (interest?.frequency && interest.nextDate && interest.nextDate <= today) {
    const date = interest.nextDate;
    accrueSavings(account, date);
    const amount = roundPence(interest.accrued ?? 0);
    interest.accrued = 0;
    if (amount > 0) {
      account.balance = roundPence(account.balance + amount);
      interest.added = [...(interest.added ?? []), { date, amount, balanceAfter: account.balance }];
    }
    interest.nextDate = followingInterestDate(
      { frequency: interest.frequency, day: interest.day ?? date.getUTCDate() },
      date
    );
    came = true;
  }
  return came;
};

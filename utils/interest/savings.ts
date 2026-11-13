import type { AccountInterest } from '../../models/account/Account';
import { previousInterestDate } from '../dates/interest';
import { ukDay } from '../dates/recurrence';
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
  const next = accrue(
    { accrued: interest.accrued ?? 0, accruedTo: savingsAccruedTo(account) },
    { daily: savingsDailyInterest(account.balance, interest.rate), to }
  );
  interest.accrued = next.accrued;
  interest.accruedTo = next.accruedTo;
};

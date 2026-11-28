import type { InterestFrequency } from '../../constants/account/interestFrequency';
import { dayInMonth } from './recurrence';

// Months from one payment to the next
export const INTEREST_MONTHS: Record<InterestFrequency, number | null> = {
  MONTHLY: 1,
  QUARTERLY: 3,
  YEARLY: 12,
  // Paid once, at the end
  MATURITY: null
};

/* A monthly payment's next date after today, on its day of the month */
export const nextMonthlyDate = (day: number, today: Date) => {
  const thisMonth = dayInMonth({ year: today.getUTCFullYear(), month: today.getUTCMonth(), day });
  return thisMonth > today
    ? thisMonth
    : dayInMonth({ year: today.getUTCFullYear(), month: today.getUTCMonth() + 1, day });
};

/*
 * The payment after this one, keeping its day of the month, or null for a fixed-term account,
 * which pays once when it ends
 */
export const followingInterestDate = (
  { frequency, day }: { frequency: InterestFrequency; day: number },
  date: Date
) => {
  const months = INTEREST_MONTHS[frequency];
  if (months === null) return null;
  return dayInMonth({ year: date.getUTCFullYear(), month: date.getUTCMonth() + months, day });
};

/*
 * The payment before the next one, which interest counts from when nothing has been counted yet.
 * None for a fixed term, which pays once.
 */
export const previousInterestDate = (
  { frequency, day }: { frequency: InterestFrequency; day: number },
  nextDate: Date
) => {
  const months = INTEREST_MONTHS[frequency];
  if (months === null) return null;
  return dayInMonth({
    year: nextDate.getUTCFullYear(),
    month: nextDate.getUTCMonth() - months,
    day
  });
};

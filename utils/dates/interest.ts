import { InterestFrequency } from '../../constants/account/interestFrequency';

// Months from one payment to the next
export const INTEREST_MONTHS: Record<InterestFrequency, number | null> = {
  MONTHLY: 1,
  QUARTERLY: 3,
  YEARLY: 12,
  // Paid once, at the end
  MATURITY: null
};

/* The given day in a month, or the month's last day when it's shorter: the 31st falls on 28 Feb */
const dayInMonth = ({ year, month, day }: { year: number; month: number; day: number }) => {
  const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, month, Math.min(day, lastDay)));
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
  return dayInMonth({ year: nextDate.getUTCFullYear(), month: nextDate.getUTCMonth() - months, day });
};

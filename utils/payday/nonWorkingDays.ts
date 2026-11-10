import { NonWorkingDay } from '../../constants/payment/nonWorkingDay';
import type { Budget } from '../../models/budget/Budget';
import type { Payday } from '../../models/payday/Payday';
import type { RecurringPayment } from '../../models/payment/RecurringPayment';
import { addDays, occurrencesBefore, type Schedule } from '../dates';
import { bankHolidaysFor } from './bankHolidays';
import { isWorkingDay, type BankHolidays } from './paydays';

/*
 * Moving a payment's dates off weekends and bank holidays. A payment keeps the dates its schedule
 * gives, which are what its records and nextDueDate hold; the move only decides when each one goes
 * out, wherever that's compared with a payday or today. Mirrors the front end's
 * src/lib/payments/nonWorkingDay.ts.
 */

export interface DateMove {
  rule: NonWorkingDay;
  holidays: BankHolidays;
}

// Further than any date moves: Christmas, Boxing Day and a weekend, with room to spare
const MAX_MOVE_DAYS = 7;

/* The day a date goes out on: itself on a working day, otherwise as the rule says */
export const goesOutOn = (date: Date, { rule, holidays }: DateMove) => {
  if (rule === NonWorkingDay.ON_DAY) return date;
  const step = rule === NonWorkingDay.BEFORE ? -1 : 1;
  let day = date;
  while (!isWorkingDay(day, holidays)) day = addDays(day, step);
  return day;
};

/*
 * A payment's dates from `from` that go out before `until`. Moving keeps the dates in order, so
 * they're the first few the schedule gives, looking a little past `until` for any moved earlier.
 */
export const datesOutBefore = (
  schedule: Schedule,
  { from, until, move }: { from: Date; until: Date; move: DateMove }
) =>
  occurrencesBefore(schedule, from, addDays(until, MAX_MOVE_DAYS)).filter(
    date => goesOutOn(date, move) < until
  );

/* What moves a budget's payments: the budget's choice and the payday region's bank holidays */
export const budgetMoves = async (
  budget: Pick<Budget, 'nonWorkingDay'>,
  payday: Pick<Payday, 'bankHolidayRegion'> | null | undefined
) => ({
  rule: budget.nonWorkingDay ?? NonWorkingDay.NEXT,
  holidays: await bankHolidaysFor(payday?.bankHolidayRegion)
});

/* How one payment's dates move: its own choice, or the budget's */
export const moveOf = (payment: Pick<RecurringPayment, 'nonWorkingDay'>, moves: DateMove): DateMove => ({
  rule: payment.nonWorkingDay ?? moves.rule,
  holidays: moves.holidays
});

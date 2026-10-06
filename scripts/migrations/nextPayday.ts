import type { Payday, PaydayOverride } from '../../models/payday/Payday';
import { PayFrequency, PaydayType } from '../../constants/payday';

/*
 * When an account's next payday falls, ported from the front end's src/lib/payday so a migration
 * lines up with the pay cycle the app shows. Dates here are UTC midnights, whatever the server's
 * time zone, and come out as 'YYYY-MM-DD'.
 */

export type PaydayRule = Pick<Payday, 'frequency' | 'type' | 'dayOfMonth' | 'weekday' | 'firstPayDate'> & {
  overrides?: readonly PaydayOverride[];
};

// Bank holidays as 'YYYY-MM-DD'
export type BankHolidays = ReadonlySet<string>;

// What the app assumes for an account with no payday saved: the last working day of the month
export const DEFAULT_PAYDAY: PaydayRule = {
  frequency: PayFrequency.MONTHLY,
  type: PaydayType.LAST_DAY
};

const DAY_MS = 86_400_000;

const MONTHS_BETWEEN: Partial<Record<PayFrequency, number>> = {
  MONTHLY: 1,
  QUARTERLY: 3,
  BIANNUAL: 6,
  ANNUAL: 12
};

const DAYS_BETWEEN: Partial<Record<PayFrequency, number>> = {
  WEEKLY: 7,
  FORTNIGHTLY: 14,
  FOUR_WEEKLY: 28
};

const WEEKDAY_NUMBER = { MONDAY: 1, TUESDAY: 2, WEDNESDAY: 3, THURSDAY: 4, FRIDAY: 5 } as const;

const day = (year: number, month: number, date: number) => new Date(Date.UTC(year, month, date));
const addDays = (date: Date, days: number) => new Date(date.getTime() + days * DAY_MS);
export const toIsoDay = (date: Date) => date.toISOString().slice(0, 10);
export const fromIsoDay = (value: string) => new Date(`${value}T00:00:00Z`);

const isWorkingDay = (date: Date, holidays: BankHolidays) =>
  date.getUTCDay() !== 0 && date.getUTCDay() !== 6 && !holidays.has(toIsoDay(date));

// Pay that would land on a weekend or bank holiday arrives the working day before
const toWorkingDay = (date: Date, holidays: BankHolidays) => {
  let current = date;
  while (!isWorkingDay(current, holidays)) current = addDays(current, -1);
  return current;
};

const paydayInMonth = (year: number, month: number, rule: PaydayRule) => {
  const lastDay = day(year, month + 1, 0);
  switch (rule.type) {
    case PaydayType.LAST_WEEKDAY: {
      const weekday = WEEKDAY_NUMBER[rule.weekday ?? 'FRIDAY'];
      return addDays(lastDay, -((lastDay.getUTCDay() - weekday + 7) % 7));
    }
    case PaydayType.SET_DAY:
      return day(year, month, Math.min(rule.dayOfMonth ?? 1, lastDay.getUTCDate()));
    default:
      return lastDay;
  }
};

const monthlyPaydays = (rule: PaydayRule, holidays: BankHolidays, from: Date, to: Date) => {
  const step = MONTHS_BETWEEN[rule.frequency] ?? 1;
  // Quarterly and longer count from the month of the first pay date
  const anchor = step > 1 && rule.firstPayDate ? fromIsoDay(rule.firstPayDate) : from;
  const anchorIndex = anchor.getUTCFullYear() * 12 + anchor.getUTCMonth();
  const fromIndex = from.getUTCFullYear() * 12 + from.getUTCMonth() - 1;
  const toIndex = to.getUTCFullYear() * 12 + to.getUTCMonth() + 1;

  const paydays: Date[] = [];
  const first = anchorIndex + Math.floor((fromIndex - anchorIndex) / step) * step;
  for (let index = first; index <= toIndex; index += step) {
    paydays.push(toWorkingDay(paydayInMonth(Math.floor(index / 12), index % 12, rule), holidays));
  }
  return paydays;
};

const weeklyPaydays = (rule: PaydayRule, holidays: BankHolidays, from: Date, to: Date) => {
  const step = DAYS_BETWEEN[rule.frequency] ?? 7;
  let anchor = rule.firstPayDate ? fromIsoDay(rule.firstPayDate) : from;
  if (rule.type === PaydayType.SET_WEEKDAY && rule.weekday) {
    anchor = addDays(anchor, (WEEKDAY_NUMBER[rule.weekday] - anchor.getUTCDay() + 7) % 7);
  }

  const stepsFromAnchor = Math.floor((from.getTime() - anchor.getTime()) / DAY_MS / step);
  const paydays: Date[] = [];
  for (let k = stepsFromAnchor - 1; ; k++) {
    const payday = addDays(anchor, k * step);
    if (payday > addDays(to, step)) break;
    paydays.push(toWorkingDay(payday, holidays));
  }
  return paydays;
};

// The first payday after `today`, with any payday the user moved taken into account
export const nextPayday = (rule: PaydayRule, holidays: BankHolidays, today: Date) => {
  const span = (MONTHS_BETWEEN[rule.frequency] ?? 1) * 31;
  const to = addDays(today, span);
  const usual =
    rule.frequency in DAYS_BETWEEN
      ? weeklyPaydays(rule, holidays, today, to)
      : monthlyPaydays(rule, holidays, today, to);

  const moves = new Map((rule.overrides ?? []).map(item => [item.for, item.date]));
  const paydays = usual
    .map(date => moves.get(toIsoDay(date)) ?? toIsoDay(date))
    .sort();
  return paydays.find(date => date > toIsoDay(today)) ?? toIsoDay(to);
};

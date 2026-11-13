import { PaymentFrequency } from '../../constants/payment';
import { PaymentType } from '../../constants/payment/paymentType';
import { NoteRepeat } from '../../constants/note/noteRepeat';
import { PayFrequency } from '../../constants/payday';
import type { CalendarFeed, ReminderSettings } from '../../models/budget/Budget';
import type { Note } from '../../models/note/Note';
import type { Payday } from '../../models/payday/Payday';
import type { OneOffPayment } from '../../models/payment/OneOffPayment';
import type { RecurringPayment } from '../../models/payment/RecurringPayment';
import type { ReminderTiming } from '../../models/reminder/reminderTiming';
import { addDays, nextOccurrence, occurrencesBefore, toIsoDay } from '../dates';
import { payDebtOn } from '../interest';
import { DEFAULT_PAYDAY, paydaysBetween, type BankHolidays } from '../payday/paydays';
import { goesOutOn, moveOf } from '../payday/nonWorkingDays';
import type { NonWorkingDay } from '../../constants/payment/nonWorkingDay';
import type { CalendarEvent } from './ics';

// How far ahead the feed goes, and how far back, so a calendar still shows the last few weeks
const DAYS_AHEAD = 366;
const DAYS_BEHIND = 31;

// A weekly payment would otherwise fill the calendar; a year of them is plenty
const MAX_PER_PAYMENT = 60;

// A debt that takes longer than this to clear isn't worth a date
const MAX_DEBT_PAYMENTS = 600;

type WithId<T> = T & { _id: { toString(): string } };

export interface FeedSource {
  feed: CalendarFeed;
  settings: ReminderSettings;
  monthlyIncome?: number;
  payments: WithId<RecurringPayment>[];
  oneOffPayments: WithId<OneOffPayment>[];
  notes: WithId<Note>[];
  payday: Payday | null;
  holidays: BankHolidays;
  // When a payment on a weekend or bank holiday goes out, unless it has its own choice
  nonWorkingDay: NonWorkingDay;
  // Midnight UTC on today's date in the UK
  today: Date;
}

const money = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' });

// "Energy due", or "Energy due · £120.00" when amounts are shown
const titled = (title: string, amount: number | null, feed: CalendarFeed) =>
  feed.showAmounts && amount != null ? `${title} · ${money.format(amount)}` : title;

// The days before to alarm: none when it's off, its own days, or the usual timing
const alarmsFor = (timing: ReminderTiming | undefined, usual: number) =>
  timing?.off ? [] : [timing?.days ?? usual];

// A note's first line, short enough for a calendar title
const noteTitle = (body = '') => {
  const line = body.trim().split('\n')[0];
  return line.length > 60 ? `${line.slice(0, 59).trimEnd()}…` : line;
};

// When a payment's date goes out, moved off weekends and bank holidays
const goesOut = (
  payment: RecurringPayment,
  { holidays, nonWorkingDay }: Pick<FeedSource, 'holidays' | 'nonWorkingDay'>
) => {
  const move = moveOf(payment, { rule: nonWorkingDay, holidays });
  return (date: Date) => goesOutOn(date, move);
};

const paymentEvents = (source: FeedSource): CalendarEvent[] => {
  const { feed, settings, payments, today } = source;
  const until = addDays(today, DAYS_AHEAD);
  return payments.flatMap(payment => {
    // Dates before the next one have been paid or skipped
    if (!payment.nextDueDate) return [];
    const yearly = payment.frequency === PaymentFrequency.ANNUALLY;
    // A yearly payment renews with each payment, so its payments are its renewals
    const asRenewal = yearly && feed.renewals;
    if (!feed.payments && !asRenewal) return [];

    const id = payment._id.toString();
    const income = payment.type === PaymentType.INCOME;
    return occurrencesBefore(payment, payment.nextDueDate, until)
      .slice(0, MAX_PER_PAYMENT)
      .map(date => {
        // The uid keeps the schedule's day, so a moved date updates its event rather than adding one
        const day = toIsoDay(date);
        const alarms = [
          ...(feed.payments ? alarmsFor(payment.dueReminder, settings.paymentDays) : []),
          ...(asRenewal ? alarmsFor(payment.renewalReminder, settings.renewalDays) : [])
        ];
        const what = asRenewal ? 'renews' : income ? 'comes in' : 'due';
        return {
          uid: `due-${id}-${day}@money-manager`,
          date: toIsoDay(goesOut(payment, source)(date)),
          title: titled(`${payment.name} ${what}`, payment.amount, feed),
          alarms
        };
      });
  });
};

// One-off payments not paid yet, from a month back
const oneOffEvents = ({ feed, settings, oneOffPayments, today }: FeedSource): CalendarEvent[] => {
  if (!feed.payments) return [];
  const from = addDays(today, -DAYS_BEHIND);
  const until = addDays(today, DAYS_AHEAD);
  return oneOffPayments.flatMap(payment => {
    if (payment.paidAt || !payment.dueDate || payment.dueDate < from || payment.dueDate > until) return [];
    const day = toIsoDay(payment.dueDate);
    const what = payment.type === PaymentType.INCOME ? 'comes in' : 'due';
    return [
      {
        uid: `one-off-${payment._id.toString()}-${day}@money-manager`,
        date: day,
        title: titled(`${payment.name} ${what}`, payment.amount, feed),
        alarms: alarmsFor(payment.dueReminder, settings.paymentDays)
      }
    ];
  });
};

const renewalEvents = ({ feed, settings, payments, today }: FeedSource): CalendarEvent[] => {
  if (!feed.renewals) return [];
  const from = addDays(today, -DAYS_BEHIND);
  return payments.flatMap(payment => {
    const { renewalDate } = payment;
    if (!renewalDate || payment.frequency === PaymentFrequency.ANNUALLY || renewalDate < from) return [];
    const day = toIsoDay(renewalDate);
    return [
      {
        uid: `renewal-${payment._id.toString()}-${day}@money-manager`,
        date: day,
        title: `${payment.name} renews`,
        description: 'Worth checking the price before it renews.',
        alarms: alarmsFor(payment.renewalReminder, settings.renewalDays)
      }
    ];
  });
};

const paydayEvents = ({ feed, settings, monthlyIncome, payday, holidays, today }: FeedSource): CalendarEvent[] => {
  if (!feed.paydays) return [];
  const rule = payday ?? DEFAULT_PAYDAY;
  // Monthly pay is the one where the monthly income is what comes in on the day
  const amount = rule.frequency === PayFrequency.MONTHLY ? (monthlyIncome ?? null) : null;
  return paydaysBetween(rule, holidays, {
    from: addDays(today, -DAYS_BEHIND),
    to: addDays(today, DAYS_AHEAD)
  }).map(day => ({
    uid: `payday-${day}@money-manager`,
    date: day,
    title: titled('Payday', amount, feed),
    alarms: settings.payday ? [0] : []
  }));
};

// How often each repeat comes round, as the payment frequency with the same steps
const REPEAT_FREQUENCIES: Partial<Record<NoteRepeat, PaymentFrequency>> = {
  MONTHLY: PaymentFrequency.MONTHLY,
  QUARTERLY: PaymentFrequency.QUARTERLY,
  BIANNUALLY: PaymentFrequency.BIANNUALLY,
  YEARLY: PaymentFrequency.ANNUALLY
};

// The note's dates inside the feed's: its own, each time it repeats, or its payment's dates
const noteDates = (note: Note, source: FeedSource) => {
  const { today, payments } = source;
  const from = addDays(today, -DAYS_BEHIND);
  const until = addDays(today, DAYS_AHEAD);
  if (note.repeat === NoteRepeat.WITH_PAYMENT) {
    const payment = payments.find(item => String(item._id) === String(note.payment));
    return payment?.nextDueDate
      ? occurrencesBefore(payment, payment.nextDueDate, until)
          .slice(0, MAX_PER_PAYMENT)
          .map(goesOut(payment, source))
      : [];
  }
  if (!note.date) return [];
  const frequency = REPEAT_FREQUENCIES[note.repeat];
  if (!frequency) return note.date >= from && note.date <= until ? [note.date] : [];
  return occurrencesBefore({ firstPaymentDate: note.date, frequency }, from, until);
};

const noteEvents = (source: FeedSource): CalendarEvent[] => {
  const { feed, notes } = source;
  if (!feed.notes) return [];
  return notes.flatMap(note =>
    noteDates(note, source).map(date => {
      const day = toIsoDay(date);
      return {
        uid: `note-${note._id.toString()}-${day}@money-manager`,
        date: day,
        title: noteTitle(note.body),
        description: note.body,
        alarms: note.remind ?? []
      };
    })
  );
};

// The day a debt's payments clear it, keeping on as they are, or null if they never would
const debtFreeDay = (payment: RecurringPayment) => {
  if (!payment.debt || payment.debt.balance <= 0 || !payment.nextDueDate) return null;
  // Paid on a copy, as the app pays it: each date adds the interest built up to it
  const { amount, frequency, firstPaymentDate, nextDueDate, debt } = payment;
  const projected = {
    amount,
    frequency,
    firstPaymentDate,
    nextDueDate,
    debt: {
      balance: debt.balance,
      apr: debt.apr,
      balanceUpdatedAt: debt.balanceUpdatedAt,
      accrued: debt.accrued,
      accruedTo: debt.accruedTo
    }
  };
  let date: Date | null = payment.nextDueDate;
  for (let k = 0; date && k < MAX_DEBT_PAYMENTS; k++) {
    if (payDebtOn(projected, [date]).balanceAfter <= 0) return date;
    date = nextOccurrence(payment, addDays(date, 1));
  }
  return null;
};

const debtFreeEvents = (source: FeedSource): CalendarEvent[] => {
  const { feed, payments } = source;
  if (!feed.debtFree) return [];
  return payments.flatMap(payment => {
    const date = debtFreeDay(payment);
    if (!date) return [];
    const day = toIsoDay(goesOut(payment, source)(date));
    return [
      {
        uid: `debt-free-${payment._id.toString()}@money-manager`,
        date: day,
        title: `${payment.name} paid off`,
        description: 'When it clears if the payments carry on as they are.',
        alarms: []
      }
    ];
  });
};

/* Everything the feed carries, soonest first */
export const calendarEvents = (source: FeedSource) =>
  [
    ...paymentEvents(source),
    ...oneOffEvents(source),
    ...renewalEvents(source),
    ...paydayEvents(source),
    ...noteEvents(source),
    ...debtFreeEvents(source)
  ].sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title));

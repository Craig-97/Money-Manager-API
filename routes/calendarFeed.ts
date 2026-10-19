import type { Request, Response } from 'express';
import { rateLimit, MINUTE } from 'express-rate-limit';
import { Budget } from '../models/budget/Budget';
import { Note } from '../models/note/Note';
import { Payday } from '../models/payday/Payday';
import { OneOffPayment } from '../models/payment/OneOffPayment';
import { RecurringPayment } from '../models/payment/RecurringPayment';
import { calendarEvents } from '../utils/calendar/calendarEvents';
import { writeCalendar } from '../utils/calendar/ics';
import { ukDay } from '../utils/dates';
import { logger } from '../utils/logger';
import { bankHolidaysFor } from '../utils/payday/bankHolidays';

// /cal/<token>.ics, where the token is the feed's secret
const FEED_FILE = /^([A-Za-z0-9_-]{20,64})\.ics$/;

// Calendar apps check every few hours; this leaves plenty of room while stopping token guessing
export const calendarFeedRateLimit = rateLimit({
  windowMs: 15 * MINUTE,
  limit: 60,
  standardHeaders: 'draft-8',
  legacyHeaders: false
});

/*
 * The calendar feed: the budget's payments, paydays, renewals, note dates and debt-free dates as
 * an .ics file. Anyone with the address can read it, so it carries amounts only when asked to, and
 * an address that isn't a feed's gets the same answer as one that never was.
 */
export const calendarFeed = async (req: Request, res: Response) => {
  const token = FEED_FILE.exec(String(req.params.file ?? ''))?.[1];
  const budget = token ? await Budget.findOne({ 'calendarFeed.token': token }) : null;
  if (!budget) {
    res.status(404).type('text/plain').send('Not found');
    return;
  }

  try {
    const [payments, oneOffPayments, notes, payday] = await Promise.all([
      RecurringPayment.find({ budget: budget._id }),
      OneOffPayment.find({ budget: budget._id, paidAt: null }),
      Note.find({ budget: budget._id, $or: [{ date: { $ne: null } }, { repeat: 'WITH_PAYMENT' }] }),
      Payday.findOne({ budget: budget._id })
    ]);
    const events = calendarEvents({
      feed: budget.calendarFeed,
      settings: budget.reminderSettings,
      monthlyIncome: budget.monthlyIncome,
      payments,
      oneOffPayments,
      notes,
      payday,
      holidays: await bankHolidaysFor(payday?.bankHolidayRegion),
      today: ukDay()
    });

    res
      .status(200)
      .set({
        'Content-Type': 'text/calendar; charset=utf-8',
        'Content-Disposition': 'inline; filename="money-manager.ics"',
        // Always the latest, and never kept by anything between the app and the calendar
        'Cache-Control': 'private, no-store'
      })
      .send(writeCalendar({ name: 'Money Manager', events }));
  } catch (error) {
    logger.error({ err: error }, 'Calendar feed failed');
    res.status(500).type('text/plain').send('Something went wrong');
  }
};

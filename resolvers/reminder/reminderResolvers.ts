import crypto from 'crypto';
import type { Request } from 'express';
import type {
  UpdateCalendarFeedInput,
  UpdateReminderSettingsInput,
  UpdateRemindersInput
} from '../../types/reminder/reminderTypes';
import { ReminderAction } from '../../constants/reminder';
import { checkBudgetAccess, checkAuth } from '../../middleware/isAuth';
import { Budget } from '../../models/budget/Budget';
import { ReminderState } from '../../models/reminder/ReminderState';
import {
  BUDGET_NOT_FOUND,
  REMINDER_UNTIL_INVALID,
  parseInput,
  reminderSettingsInput,
  remindersUpdate
} from '../../utils';
import { addDays, ukDay } from '../../utils/dates';

const DAY_MS = 86_400_000;

// What's been done with a reminder is kept this long after it last changed. By then the date it was
// for is long gone, so it won't come up again.
const KEEP_DAYS = 400;

// Later can put a reminder away for a year at most
const LATER_MAX_DAYS = 366;

const keptSince = () => new Date(Date.now() - KEEP_DAYS * DAY_MS);

const loadBudget = async (budgetId: string, req: Request) => {
  checkAuth(req);
  await checkBudgetAccess(budgetId, req);
  const budget = await Budget.findById(budgetId);
  if (!budget) {
    throw BUDGET_NOT_FOUND(budgetId);
  }
  return budget;
};

// A calendar feed's secret, long enough that it can't be guessed
export const newFeedToken = () => crypto.randomBytes(24).toString('base64url');

/* Sets when reminders go off for payments and renewals without their own timing, and payday's */
const updateReminderSettings = async (
  _: unknown,
  { input }: { input: UpdateReminderSettingsInput },
  req: Request
) => {
  const { budgetId, ...settings } = parseInput(reminderSettingsInput, input);
  const budget = await loadBudget(budgetId, req);

  for (const [field, value] of Object.entries(settings)) {
    if (value != null) budget.set(`reminderSettings.${field}`, value);
  }
  await budget.save();

  return { budget, success: true };
};

const UPDATES: Record<ReminderAction, (until: Date | null) => Record<string, unknown>> = {
  READ: () => ({ read: true }),
  // Leaves read alone, so undoing it brings it back just as it was
  CLEAR: () => ({ cleared: true }),
  // When it goes off again it's new, so it counts again
  LATER: until => ({ snoozedUntil: until, read: false }),
  RESTORE: () => ({ cleared: false, snoozedUntil: null })
};

// The day Later puts a reminder away until: after today, and within a year
const laterDay = (until: string | null | undefined) => {
  const today = ukDay();
  const day = until ? new Date(`${until}T00:00:00Z`) : null;
  if (!day || day <= today || day > addDays(today, LATER_MAX_DAYS)) {
    throw REMINDER_UNTIL_INVALID();
  }
  return day;
};

/* Marks reminders read, clears them, puts them away until a day, or brings them back */
const updateReminders = async (_: unknown, { input }: { input: UpdateRemindersInput }, req: Request) => {
  checkAuth(req);
  const { budgetId, keys, action, until } = parseInput(remindersUpdate, input);
  await checkBudgetAccess(budgetId, req);

  const update = UPDATES[action](action === ReminderAction.LATER ? laterDay(until) : null);
  const unique = [...new Set(keys)];
  await ReminderState.bulkWrite(
    unique.map(key => ({
      updateOne: { filter: { budget: budgetId, key }, update: { $set: update }, upsert: true }
    }))
  );
  // Ones that won't come up again go, so the list stays short
  await ReminderState.deleteMany({ budget: budgetId, updatedAt: { $lt: keptSince() } });

  const states = await ReminderState.find({ budget: budgetId, key: { $in: unique } });
  return { states, success: true };
};

const FEED_FIELDS = ['payments', 'paydays', 'renewals', 'notes', 'debtFree', 'showAmounts'] as const;

/* Turns the calendar feed on or off, and chooses what it carries */
const updateCalendarFeed = async (_: unknown, { input }: { input: UpdateCalendarFeedInput }, req: Request) => {
  const budget = await loadBudget(input.budgetId, req);

  if (input.enabled === true && !budget.calendarFeed.token) {
    budget.set('calendarFeed.token', newFeedToken());
  } else if (input.enabled === false) {
    // Its address stops working; turning it on again gives a new one
    budget.set('calendarFeed.token', null);
  }
  for (const field of FEED_FIELDS) {
    const value = input[field];
    if (value != null) budget.set(`calendarFeed.${field}`, value);
  }
  await budget.save();

  return { budget, success: true };
};

/* Gives the feed a new address, e.g. after sharing it by mistake. The old one stops working. */
const resetCalendarFeed = async (_: unknown, { budgetId }: { budgetId: string }, req: Request) => {
  const budget = await loadBudget(budgetId, req);
  budget.set('calendarFeed.token', newFeedToken());
  await budget.save();
  return { budget, success: true };
};

type BudgetDocument = InstanceType<typeof Budget>;

export const reminderResolvers = {
  Mutation: {
    updateReminderSettings,
    updateReminders,
    updateCalendarFeed,
    resetCalendarFeed
  },
  Budget: {
    // What's been done with reminders, leaving out ones too old to come up again
    reminderStates: (budget: BudgetDocument) =>
      ReminderState.find({ budget: budget._id, updatedAt: { $gte: keptSince() } }).exec()
  }
};

import crypto from 'crypto';
import type { Request } from 'express';
import type {
  UpdateCalendarFeedInput,
  UpdateReminderSettingsInput,
  UpdateRemindersInput
} from '../../types/reminder/reminderTypes';
import { ReminderAction } from '../../constants/reminder';
import { checkAccountAccess, checkAuth } from '../../middleware/isAuth';
import { Account } from '../../models/account/Account';
import { ReminderState } from '../../models/reminder/ReminderState';
import {
  ACCOUNT_NOT_FOUND,
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

const loadAccount = async (accountId: string, req: Request) => {
  checkAuth(req);
  await checkAccountAccess(accountId, req);
  const account = await Account.findById(accountId);
  if (!account) {
    throw ACCOUNT_NOT_FOUND(accountId);
  }
  return account;
};

// A calendar feed's secret, long enough that it can't be guessed
export const newFeedToken = () => crypto.randomBytes(24).toString('base64url');

/* Sets when reminders go off for payments and renewals without their own timing, and payday's */
const updateReminderSettings = async (
  _: unknown,
  { input }: { input: UpdateReminderSettingsInput },
  req: Request
) => {
  const { accountId, ...settings } = parseInput(reminderSettingsInput, input);
  const account = await loadAccount(accountId, req);

  for (const [field, value] of Object.entries(settings)) {
    if (value != null) account.set(`reminderSettings.${field}`, value);
  }
  await account.save();

  return { account, success: true };
};

const UPDATES: Record<ReminderAction, (until: Date | null) => Record<string, unknown>> = {
  READ: () => ({ read: true }),
  // Clearing one is seeing it
  CLEAR: () => ({ cleared: true, read: true }),
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
  const { accountId, keys, action, until } = parseInput(remindersUpdate, input);
  await checkAccountAccess(accountId, req);

  const update = UPDATES[action](action === ReminderAction.LATER ? laterDay(until) : null);
  const unique = [...new Set(keys)];
  await ReminderState.bulkWrite(
    unique.map(key => ({
      updateOne: { filter: { account: accountId, key }, update: { $set: update }, upsert: true }
    }))
  );
  // Ones that won't come up again go, so the list stays short
  await ReminderState.deleteMany({ account: accountId, updatedAt: { $lt: keptSince() } });

  const states = await ReminderState.find({ account: accountId, key: { $in: unique } });
  return { states, success: true };
};

const FEED_FIELDS = ['payments', 'paydays', 'renewals', 'notes', 'debtFree', 'showAmounts'] as const;

/* Turns the calendar feed on or off, and chooses what it carries */
const updateCalendarFeed = async (_: unknown, { input }: { input: UpdateCalendarFeedInput }, req: Request) => {
  const account = await loadAccount(input.accountId, req);

  if (input.enabled === true && !account.calendarFeed.token) {
    account.set('calendarFeed.token', newFeedToken());
  } else if (input.enabled === false) {
    // Its address stops working; turning it on again gives a new one
    account.set('calendarFeed.token', null);
  }
  for (const field of FEED_FIELDS) {
    const value = input[field];
    if (value != null) account.set(`calendarFeed.${field}`, value);
  }
  await account.save();

  return { account, success: true };
};

/* Gives the feed a new address, e.g. after sharing it by mistake. The old one stops working. */
const resetCalendarFeed = async (_: unknown, { accountId }: { accountId: string }, req: Request) => {
  const account = await loadAccount(accountId, req);
  account.set('calendarFeed.token', newFeedToken());
  await account.save();
  return { account, success: true };
};

type AccountDocument = InstanceType<typeof Account>;

export const reminderResolvers = {
  Mutation: {
    updateReminderSettings,
    updateReminders,
    updateCalendarFeed,
    resetCalendarFeed
  },
  Account: {
    // What's been done with reminders, leaving out ones too old to come up again
    reminderStates: (account: AccountDocument) =>
      ReminderState.find({ account: account._id, updatedAt: { $gte: keptSince() } }).exec()
  }
};

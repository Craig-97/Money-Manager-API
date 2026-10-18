import { z } from 'zod';
import { PAYMENT_REMINDER_DAYS, RENEWAL_REMINDER_DAYS } from '../../../constants/reminder';
import { isoDay } from '../common';

const oneOf = (choices: readonly number[], what: string) =>
  z.number().refine(days => choices.includes(days), `${what} must be ${choices.join(', ')} days before`);

// Loose, so fields without rules here (the account, the action, the switches) come through
// parsing untouched

export const reminderSettingsInput = z.looseObject({
  paymentDays: oneOf(PAYMENT_REMINDER_DAYS, 'Payment reminders').nullish(),
  renewalDays: oneOf(RENEWAL_REMINDER_DAYS, 'Renewal reminders').nullish()
});

// A reminder's key: what it's about and the date it's for, e.g. "due:<payment id>:2026-10-09"
const reminderKey = z
  .string()
  .max(120, 'Reminder keys are 120 characters at most')
  .regex(/^[a-z]+(:[A-Za-z0-9_-]+)+$/, 'That is not a reminder');

export const remindersUpdate = z.looseObject({
  keys: z.array(reminderKey).min(1, 'Choose at least one reminder').max(200, 'Up to 200 reminders at once'),
  until: isoDay.nullish()
});

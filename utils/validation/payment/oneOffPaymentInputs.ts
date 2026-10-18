import { z } from 'zod';
import { PAYMENT_REMINDER_DAYS } from '../../../constants/reminder';
import { amount, isoDate, reminderTiming } from '../common';
import { paymentName, paymentShape } from './paymentFields';

// Loose, so fields without rules here (a category, a type) come through parsing untouched

const dueReminder = reminderTiming(PAYMENT_REMINDER_DAYS).optional();

export const newOneOff = z.looseObject({ ...paymentShape, dueDate: isoDate, dueReminder });

export const oneOffInput = z.looseObject({
  name: paymentName.optional(),
  amount: amount.optional(),
  dueDate: isoDate.optional(),
  dueReminder
});

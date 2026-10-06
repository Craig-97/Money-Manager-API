import { z } from 'zod';
import { amount, isoDate } from '../common';
import { paymentName, paymentShape } from './paymentFields';

// Loose, so fields without rules here (a category, a frequency) come through parsing untouched

export const recurringInput = z.looseObject({
  name: paymentName.optional(),
  amount: amount.optional(),
  firstPaymentDate: isoDate.optional(),
  lastPaymentDate: isoDate.nullish()
});

export const newRecurring = recurringInput.extend({ ...paymentShape, firstPaymentDate: isoDate });

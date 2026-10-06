import { z } from 'zod';
import { amount, isoDate } from '../common';
import { paymentName, paymentShape } from './paymentFields';

// Loose, so fields without rules here (a category, a type) come through parsing untouched

export const newOneOff = z.looseObject({ ...paymentShape, dueDate: isoDate });

export const oneOffInput = z.looseObject({
  name: paymentName.optional(),
  amount: amount.optional(),
  dueDate: isoDate.optional()
});

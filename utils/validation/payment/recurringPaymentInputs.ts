import { z } from 'zod';
import { amount, isoDate } from '../common';
import { paymentName, paymentShape } from './paymentFields';

// Loose, so fields without rules here (a category, a frequency) come through parsing untouched

export const recurringInput = z.looseObject({
  name: paymentName.optional(),
  amount: amount.optional(),
  firstPaymentDate: isoDate.optional(),
  lastPaymentDate: isoDate.nullish(),
  renewalDate: isoDate.nullish(),
  renewalReminderDays: z.literal([0, 7, 14, 30], 'Reminders must be 0, 7, 14 or 30 days').optional()
});

type DateValue = Date | string | null | undefined;

interface RenewalFields {
  frequency?: string;
  firstPaymentDate?: DateValue;
  lastPaymentDate?: DateValue;
  renewalDate?: DateValue;
}

const dayOf = (value: DateValue) => (value ? new Date(value).getTime() : null);

/*
 * How a payment ends is one choice: it keeps going, renews on a date, or stops after a last
 * payment. Yearly payments renew with each payment, so they never have a renewal date of their own.
 * Checked on the whole payment, as an update may change only one side of a rule.
 */
const renewalRules = (payment: RenewalFields, ctx: z.RefinementCtx) => {
  const renewal = dayOf(payment.renewalDate);
  if (renewal === null) return;
  const issue = (message: string) => ctx.addIssue({ code: 'custom', message, path: ['renewalDate'] });

  if (dayOf(payment.lastPaymentDate) !== null) {
    issue('A payment can renew or stop, not both');
  } else if (payment.frequency === 'ANNUALLY') {
    issue('Yearly payments renew with each payment, so they have no renewal date');
  } else {
    const first = dayOf(payment.firstPaymentDate);
    if (first !== null && renewal <= first) issue('The renewal date must be after the first payment');
  }
};

export const newRecurring = recurringInput
  .extend({ ...paymentShape, firstPaymentDate: isoDate })
  .superRefine(renewalRules);

// A payment with an update applied, checked as a whole
export const updatedRecurring = z.looseObject({}).superRefine(renewalRules);

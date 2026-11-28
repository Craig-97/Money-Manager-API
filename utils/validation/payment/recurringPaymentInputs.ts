import { z } from 'zod';
import { PaymentType } from '../../../constants/payment/paymentType';
import {
  PAYMENT_REMINDER_DAYS,
  RATE_ENDS_REMINDER_DAYS,
  RATE_ENDS_USUAL_DAYS
} from '../../../constants/reminder';
import { amount, iconUrl, isoDate, reminderTiming } from '../common';
import { paymentName, paymentShape } from './paymentFields';

// Loose, so fields without rules here (a category, a frequency) come through parsing untouched

// A loan or card the payment pays off
const debtInput = z.object({
  balance: amount,
  startingBalance: amount.nullish(),
  apr: z.number().finite().min(0, "APR can't be negative").max(100, 'APR must be 100% or less'),
  // null clears it
  rateEndsOn: isoDate.nullish()
});

export const recurringInput = z.looseObject({
  name: paymentName.optional(),
  amount: amount.optional(),
  firstPaymentDate: isoDate.optional(),
  lastPaymentDate: isoDate.nullish(),
  renewalDate: isoDate.nullish(),
  dueReminder: reminderTiming(PAYMENT_REMINDER_DAYS).optional(),
  // A rate end's choices too; paymentRules keeps the longest for a debt with one
  renewalReminder: reminderTiming(RATE_ENDS_REMINDER_DAYS).optional(),
  // null stops tracking it as a debt
  debt: debtInput.nullish(),
  iconUrl
});

type DateValue = Date | string | null | undefined;

interface PaymentRuleFields {
  frequency?: string;
  type?: string;
  firstPaymentDate?: DateValue;
  lastPaymentDate?: DateValue;
  renewalDate?: DateValue;
  renewalReminder?: { days?: number | null } | null;
  debt?: { rateEndsOn?: DateValue } | null;
}

const dayOf = (value: DateValue) => (value ? new Date(value).getTime() : null);

/*
 * How a payment ends is one choice: it keeps going, renews on a date, or stops after a last
 * payment. Yearly payments renew with each payment, so they never have a renewal date of their own.
 * Checked on the whole payment, as an update may change only one side of a rule.
 */
const renewalRules = (payment: PaymentRuleFields, ctx: z.RefinementCtx) => {
  const renewal = dayOf(payment.renewalDate);
  if (renewal === null) return;
  const issue = (message: string) =>
    ctx.addIssue({ code: 'custom', message, path: ['renewalDate'] });

  if (dayOf(payment.lastPaymentDate) !== null) {
    issue('A payment can renew or stop, not both');
  } else if (payment.frequency === 'ANNUALLY') {
    issue('Yearly payments renew with each payment, so they have no renewal date');
  } else {
    const first = dayOf(payment.firstPaymentDate);
    if (first !== null && renewal <= first)
      issue('The renewal date must be after the first payment');
  }
};

// A debt is always paid off, never paid in
const debtRules = (payment: PaymentRuleFields, ctx: z.RefinementCtx) => {
  if (payment.debt && payment.type === PaymentType.INCOME) {
    ctx.addIssue({ code: 'custom', message: "Income can't be tracked as a debt", path: ['debt'] });
  }
};

// Three months before is for a rate ending; a renewal's reminder goes no further than a month
const reminderRules = (payment: PaymentRuleFields, ctx: z.RefinementCtx) => {
  if (payment.renewalReminder?.days === RATE_ENDS_USUAL_DAYS && !payment.debt?.rateEndsOn) {
    ctx.addIssue({
      code: 'custom',
      message: 'Reminders must be 7, 14 or 30 days before, or 90 for a debt whose rate ends',
      path: ['renewalReminder', 'days']
    });
  }
};

const paymentRules = (payment: PaymentRuleFields, ctx: z.RefinementCtx) => {
  renewalRules(payment, ctx);
  debtRules(payment, ctx);
  reminderRules(payment, ctx);
};

export const newRecurring = recurringInput
  .extend({ ...paymentShape, firstPaymentDate: isoDate })
  .superRefine(paymentRules);

// A payment with an update applied, checked as a whole
export const updatedRecurring = z.looseObject({}).superRefine(paymentRules);

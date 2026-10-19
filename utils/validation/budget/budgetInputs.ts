import { z } from 'zod';
import { LeftOverOutcome } from '../../../constants/payday/leftOverOutcome';
import { isoDay, money } from '../common';
import { newOneOff, newRecurring } from '../payment';
import { paydayInput } from '../payday';

// Loose, so fields without rules here (the user, the payment ids) come through parsing untouched

// A budget, with the payments and payday set up alongside it
export const newBudget = z.looseObject({
  bankBalance: money,
  monthlyIncome: money,
  oneOffPayments: z.array(newOneOff).nullish(),
  recurringPayments: z.array(newRecurring).nullish(),
  payday: paydayInput.nullish()
});

export const budgetInput = z.looseObject({ bankBalance: money.optional(), monthlyIncome: money.optional() });

export const paydayCycle = z.looseObject({
  payday: isoDay,
  bankBalance: money,
  leftOver: z.array(z.looseObject({ outcome: z.enum(LeftOverOutcome) }))
});

export const skipRecurring = z.looseObject({ until: isoDay.nullish() });

// Paying extra off a debt, on top of its usual payments
export const debtOverpayment = z.looseObject({
  amount: money.positive('Overpayments must be more than £0')
});

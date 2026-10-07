import { z } from 'zod';
import { isoDay, money } from '../common';
import { newOneOff, newRecurring } from '../payment';
import { paydayInput } from '../payday';

// Loose, so fields without rules here (the user, the payment ids) come through parsing untouched

// An account, with the payments and payday set up alongside it
export const newAccount = z.looseObject({
  bankBalance: money,
  monthlyIncome: money,
  oneOffPayments: z.array(newOneOff).nullish(),
  recurringPayments: z.array(newRecurring).nullish(),
  payday: paydayInput.nullish()
});

export const accountInput = z.looseObject({ bankBalance: money.optional(), monthlyIncome: money.optional() });

export const paydayCycle = z.looseObject({ payday: isoDay, bankBalance: money });

export const skipRecurring = z.looseObject({ until: isoDay.nullish() });

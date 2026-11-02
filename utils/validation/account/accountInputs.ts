import { z } from 'zod';
import { AccountKind } from '../../../constants/account/accountKind';
import { InterestFrequency } from '../../../constants/account/interestFrequency';
import { isoDate, money } from '../common';

// Loose, so fields without rules here (the budget, the account ids) come through parsing untouched

export const accountName = z
  .string()
  .trim()
  .min(1, 'Names cannot be empty')
  .max(50, 'Names must be 50 characters or fewer');

const rate = z
  .number()
  .finite()
  .min(0, "Interest rates can't be negative")
  .max(100, 'Interest rates must be 100% or under');

// A monthly payment needs its day; the others need the date of the next one
export const interest = z
  .looseObject({
    rate,
    frequency: z.enum(Object.values(InterestFrequency) as [InterestFrequency, ...InterestFrequency[]]).nullish(),
    day: z.number().int().min(1, 'Choose a day from 1 to 31').max(31, 'Choose a day from 1 to 31').nullish(),
    nextDate: isoDate.nullish()
  })
  .superRefine((value, ctx) => {
    if (value.frequency === InterestFrequency.MONTHLY && !value.day) {
      ctx.addIssue({ code: 'custom', message: 'Choose the day of the month it’s paid', path: ['day'] });
    }
    if (value.frequency && value.frequency !== InterestFrequency.MONTHLY && !value.nextDate) {
      ctx.addIssue({ code: 'custom', message: 'Choose when it’s next paid', path: ['nextDate'] });
    }
  })
  .nullish();

export const interestCheck = z.looseObject({
  amount: money.min(0, "Interest can't be negative").nullish()
});

// Blank means none
const purpose = z
  .string()
  .trim()
  .max(60, 'What it’s for must be 60 characters or fewer')
  .transform(value => value || null)
  .nullish();

const kind = z.enum(Object.values(AccountKind) as [AccountKind, ...AccountKind[]]);

// Pay moves to an account by making it where pay lands, never by turning this off
const paidInto = z.literal(true, 'Make another account where you get paid instead');

export const newAccount = z.looseObject({
  name: accountName,
  kind: kind.nullish(),
  balance: money,
  counts: z.boolean().nullish(),
  paidInto: paidInto.nullish(),
  interest,
  purpose
});

export const accountInput = z.looseObject({
  name: accountName.optional(),
  kind: kind.optional(),
  balance: money.optional(),
  counts: z.boolean().optional(),
  paidInto: paidInto.optional(),
  interest,
  purpose
});

export const accountBalances = z.looseObject({
  balances: z.array(z.looseObject({ balance: money }))
});

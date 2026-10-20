import { z } from 'zod';
import { AccountKind } from '../../../constants/account/accountKind';
import { money } from '../common';

// Loose, so fields without rules here (the budget, the account ids) come through parsing untouched

export const accountName = z
  .string()
  .trim()
  .min(1, 'Names cannot be empty')
  .max(50, 'Names must be 50 characters or fewer');

const interestRate = z
  .number()
  .finite()
  .min(0, "Interest rates can't be negative")
  .max(100, 'Interest rates must be 100% or under')
  .nullish();

// Blank means none
const purpose = z
  .string()
  .trim()
  .max(60, 'What it’s for must be 60 characters or fewer')
  .transform(value => value || null)
  .nullish();

const kind = z.enum(Object.values(AccountKind) as [AccountKind, ...AccountKind[]]);

export const newAccount = z.looseObject({
  name: accountName,
  kind: kind.nullish(),
  balance: money,
  counts: z.boolean().nullish(),
  interestRate,
  purpose
});

export const accountInput = z.looseObject({
  name: accountName.optional(),
  kind: kind.optional(),
  balance: money.optional(),
  counts: z.boolean().optional(),
  // Pay moves to an account by making it where pay lands, never by turning this off
  paidInto: z.literal(true, 'Make another account where you get paid instead').optional(),
  interestRate,
  purpose
});

export const accountBalances = z.looseObject({
  balances: z.array(z.looseObject({ balance: money }))
});

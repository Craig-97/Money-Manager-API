import { z } from 'zod';
import { money } from '../common';

// Loose, so fields without rules here (the budget, the account ids) come through parsing untouched

const accountName = z
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

export const newAccount = z.looseObject({
  name: accountName,
  balance: money,
  counts: z.boolean().nullish(),
  interestRate,
  purpose
});

export const accountInput = z.looseObject({
  name: accountName.optional(),
  balance: money.optional(),
  counts: z.boolean().optional(),
  interestRate,
  purpose
});

export const accountBalances = z.looseObject({
  balances: z.array(z.looseObject({ balance: money }))
});

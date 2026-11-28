import { z } from 'zod';

const MAX_MONEY = 1_000_000_000;

// A balance or income: can be negative (an overdraft), but has to be a real, sensible number
export const money = z
  .number()
  .finite()
  .min(-MAX_MONEY, 'Amounts must be under a billion')
  .max(MAX_MONEY, 'Amounts must be under a billion');

// What a payment costs or brings in
export const amount = money.min(0, "Amounts can't be negative");

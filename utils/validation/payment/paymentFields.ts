import { z } from 'zod';
import { amount } from '../common';

export const paymentName = z
  .string()
  .trim()
  .min(1, 'Names cannot be empty')
  .max(60, 'Names must be 60 characters or fewer');

// What every kind of payment has when it's created
export const paymentShape = { name: paymentName, amount };

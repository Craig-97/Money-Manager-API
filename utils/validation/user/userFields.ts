import { z } from 'zod';

export const email = z.string().trim().max(254, 'Email is too long').email('Enter a valid email address');

export const personName = z
  .string()
  .trim()
  .min(1, 'Names cannot be empty')
  .max(50, 'Names must be 50 characters or fewer');

// Matches the rules the front-end enforces on its password fields. bcrypt ignores anything past 72
// bytes, so longer passwords are refused rather than quietly cut short.
export const password = z
  .string()
  .min(8)
  .regex(/[0-9]/)
  .refine(value => Buffer.byteLength(value) <= 72);

// One of the hex colours the app offers as an accent
export const accent = z.string().regex(/^#[0-9a-f]{6}$/i);

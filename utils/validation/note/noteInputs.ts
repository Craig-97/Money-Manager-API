import { z } from 'zod';

export const noteBody = z
  .string()
  .trim()
  .min(1, 'Notes cannot be empty')
  .max(2000, 'Notes must be 2000 characters or fewer');

// Loose, so fields without rules here (the colour, the account) come through parsing untouched

export const newNote = z.looseObject({ body: noteBody });

export const noteInput = z.looseObject({ body: noteBody.optional() });

import { z } from 'zod';
import { NOTE_REMINDER_DAYS } from '../../../constants/reminder';
import { isoDate, reminderDaysList } from '../common';

export const noteBody = z
  .string()
  .trim()
  .min(1, 'Notes cannot be empty')
  .max(2000, 'Notes must be 2000 characters or fewer');

// Loose, so fields without rules here (the colour, the repeat, the account) come through parsing
// untouched

const noteFields = {
  date: isoDate.nullish(),
  remind: reminderDaysList(NOTE_REMINDER_DAYS).optional()
};

export const newNote = z.looseObject({ body: noteBody, ...noteFields });

export const noteInput = z.looseObject({ body: noteBody.optional(), ...noteFields });

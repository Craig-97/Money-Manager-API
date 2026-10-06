import { z } from 'zod';

// A calendar day as YYYY-MM-DD, optionally followed by a time, that really exists (no 31 February)
const isRealDay = (value: string) => {
  const day = value.slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return false;
  const parsed = new Date(`${day}T00:00:00Z`);
  // A month or day out of range gives an invalid date; one that rolls over (31 February) gives another day
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString().startsWith(day);
};

export const isoDate = z.string().refine(isRealDay, 'Dates must be real dates in the format YYYY-MM-DD');

// Exactly YYYY-MM-DD, for values compared as strings, like payday overrides
export const isoDay = isoDate.refine(value => value.length === 10, 'Dates must be in the format YYYY-MM-DD');

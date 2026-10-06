import { z } from 'zod';
import { isoDate, isoDay } from '../common';

// Loose, so fields without rules here (the frequency, the type) come through parsing untouched

export const paydayInput = z.looseObject({ firstPayDate: isoDate.nullish() });

export const paydayOverride = z.looseObject({ for: isoDay, date: isoDay.nullish() });

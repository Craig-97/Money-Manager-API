import { z } from 'zod';
import { email, personName } from './userFields';

// Loose, so fields without rules here come through parsing untouched

export const userDetails = z.looseObject({ firstName: personName, surname: personName, email });

// The password is checked separately, so it can keep its own INVALID_PASSWORD error
export const newUser = userDetails.extend({ password: z.string() });

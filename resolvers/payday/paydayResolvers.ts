import type { Request } from 'express';
import { checkAuth } from '../../middleware/isAuth';
import { Payday } from '../../models/payday/Payday';
import type { PaydayInput } from '../../types/payday/paydayTypes';
import {
  PAYDAY_NOT_FOUND,
  PAYDAY_OVERRIDE_INVALID,
  ownDocumentOrThrow,
  parseInput,
  paydayInput,
  paydayOverride,
  addDays,
  toIsoDay
} from '../../utils';

const updatePayday = async (
  _: unknown,
  { id, input }: { id: string; input: PaydayInput },
  req: Request
) => {
  checkAuth(req);
  const currentPayday = await ownDocumentOrThrow(Payday, { id, req, notFound: PAYDAY_NOT_FOUND });
  input = parseInput(paydayInput, input);

  Object.assign(currentPayday, input).increment();
  await currentPayday.save();

  return { payday: currentPayday, success: true };
};

// Moves one payday to another date, or back to the usual date when `date` is left out. An override
// belongs to the date the rule gave, so it stops mattering once that date has passed.
const setPaydayOverride = async (
  _: unknown,
  { id, for: usual, date }: { id: string; for: string; date?: string | null },
  req: Request
) => {
  checkAuth(req);
  const payday = await ownDocumentOrThrow(Payday, { id, req, notFound: PAYDAY_NOT_FOUND });

  parseInput(paydayOverride, { for: usual, date }, issue => PAYDAY_OVERRIDE_INVALID(issue.message));

  // A day's grace so someone just behind UTC doesn't lose an override still in force for them
  const cutoff = toIsoDay(addDays(new Date(), -1));
  const kept = payday.overrides.filter(item => item.for !== usual && item.for >= cutoff);
  const overrides = date && date !== usual ? [...kept, { for: usual, date }] : kept;
  overrides.sort((a, b) => a.for.localeCompare(b.for));

  payday.set('overrides', overrides);
  payday.increment();
  await payday.save();

  return { payday, success: true };
};

export const paydayResolvers = {
  Mutation: {
    updatePayday,
    setPaydayOverride
  }
};

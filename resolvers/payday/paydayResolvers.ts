import type { Request } from 'express';
import type { PaydayInput } from '../../types/payday/paydayTypes';
import { checkAuth } from '../../middleware/isAuth';
import { Payday } from '../../models/payday/Payday';
import {
  PAYDAY_NOT_FOUND,
  PAYDAY_UPDATE_FAILED,
  PAYDAY_OVERRIDE_INVALID,
  incrementVersion,
  ownDocumentOrThrow,
  parseInput,
  paydayInput,
  paydayOverride
} from '../../utils';
import { addDays, toIsoDay } from '../../utils/dates';

const updatePayday = async (_: unknown, { id, input }: { id: string; input: PaydayInput }, req: Request) => {
  checkAuth(req);
  const currentPayday = await ownDocumentOrThrow(Payday, { id, req, notFound: PAYDAY_NOT_FOUND });
  input = parseInput(paydayInput, input);

  const mergedPayday = incrementVersion(Object.assign(currentPayday, input));

  const updatedPayday = await Payday.findOneAndUpdate({ _id: id }, mergedPayday, {
    new: true
  });

  if (!updatedPayday) {
    throw PAYDAY_UPDATE_FAILED();
  }

  return { payday: updatedPayday, success: true };
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

  const edited = await Payday.findOneAndUpdate(
    { _id: id },
    { $set: { overrides }, $inc: { __v: 1 } },
    { new: true }
  );
  if (!edited) {
    throw PAYDAY_UPDATE_FAILED();
  }

  return { payday: edited, success: true };
};

export const paydayResolvers = {
  Mutation: {
    updatePayday,
    setPaydayOverride
  }
};

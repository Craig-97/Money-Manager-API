import type { Request } from 'express';
import type { PaydayInput } from '../../types/payday/paydayTypes';
import { checkAuth, checkAccountAccess } from '../../middleware/isAuth';
import { Payday } from '../../models/payday/Payday';
import {
  PAYDAY_NOT_FOUND,
  PAYDAY_UPDATE_FAILED,
  PAYDAY_OVERRIDE_INVALID,
  incrementVersion,
  parseInput,
  paydayInput,
  paydayOverride
} from '../../utils';

const updatePayday = async (_: unknown, { id, input }: { id: string; input: PaydayInput }, req: Request) => {
  checkAuth(req);
  const currentPayday = await Payday.findById(id);
  if (!currentPayday) {
    throw PAYDAY_NOT_FOUND(id);
  }
  await checkAccountAccess(currentPayday.account, req);
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

const isoDaysAgo = (days: number) =>
  new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);

// Moves one payday to another date, or back to the usual date when `date` is left out. An override
// belongs to the date the rule gave, so it stops mattering once that date has passed.
const setPaydayOverride = async (
  _: unknown,
  { id, for: usual, date }: { id: string; for: string; date?: string | null },
  req: Request
) => {
  checkAuth(req);
  const payday = await Payday.findById(id);
  if (!payday) {
    throw PAYDAY_NOT_FOUND(id);
  }
  await checkAccountAccess(payday.account, req);

  parseInput(paydayOverride, { for: usual, date }, issue => PAYDAY_OVERRIDE_INVALID(issue.message));

  // A day's grace so someone just behind UTC doesn't lose an override still in force for them
  const cutoff = isoDaysAgo(1);
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

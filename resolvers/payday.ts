import type { Request } from 'express';
import type { CreatePaydayInput, PaydayInput } from '../types/payday';
import { checkAuth, checkAccountAccess } from '../middleware/isAuth';
import { Account } from '../models/Account';
import { Payday } from '../models/Payday';
import {
  ACCOUNT_NOT_FOUND,
  PAYDAY_NOT_FOUND,
  PAYDAYS_NOT_FOUND,
  PAYDAY_EXISTS,
  PAYDAY_UPDATE_FAILED,
  PAYDAY_DELETE_FAILED,
  PAYDAY_OVERRIDE_INVALID,
  withTransaction,
  incrementVersion
} from '../utils';

const findPaydays = async (_: unknown, _1: unknown, req: Request) => {
  await checkAuth(req);
  const paydays = await Payday.find({ account: req.accountId });
  if (!paydays) {
    throw PAYDAYS_NOT_FOUND();
  }
  return paydays;
};

const findPayday = async (_: unknown, { id }: { id: string }, req: Request) => {
  await checkAuth(req);
  const payday = await Payday.findById(id);
  if (!payday) {
    throw PAYDAY_NOT_FOUND(id);
  }
  await checkAccountAccess(payday.account, req);
  return payday;
};

const createPayday = async (_: unknown, { payday }: { payday: CreatePaydayInput }, req: Request) => {
  await checkAuth(req);
  await checkAccountAccess(payday.account, req);
  try {
    const existingPayday = await Payday.findOne({ account: payday.account });
    if (existingPayday) {
      throw PAYDAY_EXISTS();
    }

    const newPayday = new Payday(payday);
    await newPayday.save();

    // Update Account with payday reference
    if (newPayday.account) {
      const account = await Account.findOne({ _id: newPayday.account });
      if (account) {
        account.payday = newPayday._id;
        await account.save();
      } else {
        throw ACCOUNT_NOT_FOUND(newPayday.account);
      }
    }

    return { payday: newPayday, success: true };
  } catch (err) {
    throw err;
  }
};

const editPayday = async (_: unknown, { id, payday }: { id: string; payday: PaydayInput }, req: Request) => {
  await checkAuth(req);
  const currentPayday = await Payday.findById(id);
  if (!currentPayday) {
    throw PAYDAY_NOT_FOUND(id);
  }
  await checkAccountAccess(currentPayday.account, req);

  const mergedPayday = incrementVersion(Object.assign(currentPayday, payday));

  const editedPayday = await Payday.findOneAndUpdate({ _id: id }, mergedPayday, {
    new: true
  });

  if (!editedPayday) {
    throw PAYDAY_UPDATE_FAILED();
  }

  return {
    payday: editedPayday,
    success: true
  };
};

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

const isRealDate = (value: string) =>
  ISO_DATE.test(value) && new Date(`${value}T00:00:00Z`).toISOString().startsWith(value);

const isoDaysAgo = (days: number) =>
  new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);

// Moves one payday to another date, or back to the usual date when `date` is left out. An override
// belongs to the date the rule gave, so it stops mattering once that date has passed.
const setPaydayOverride = async (
  _: unknown,
  { id, for: usual, date }: { id: string; for: string; date?: string | null },
  req: Request
) => {
  await checkAuth(req);
  const payday = await Payday.findById(id);
  if (!payday) {
    throw PAYDAY_NOT_FOUND(id);
  }
  await checkAccountAccess(payday.account, req);

  if (!isRealDate(usual) || (date && !isRealDate(date))) {
    throw PAYDAY_OVERRIDE_INVALID('Dates must be real dates in the format YYYY-MM-DD');
  }

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

const deletePayday = async (_: unknown, { id }: { id: string }, req: Request) => {
  await checkAuth(req);
  const payday = await Payday.findById(id);
  if (!payday) {
    throw PAYDAY_NOT_FOUND(id);
  }
  await checkAccountAccess(payday.account, req);

  return withTransaction(async session => {
    // Remove payday reference from account
    const account = await Account.findOne({ payday: payday._id }).session(session);
    if (account) {
      account.payday = undefined;
      await account.save({ session });
    }

    const response = await Payday.deleteOne({ _id: id }).session(session);
    if (payday && response.deletedCount === 1) {
      return {
        payday,
        success: true
      };
    } else {
      throw PAYDAY_DELETE_FAILED();
    }
  });
};

export const resolvers = {
  Query: {
    paydays: findPaydays,
    payday: findPayday
  },
  Mutation: {
    createPayday,
    editPayday,
    setPaydayOverride,
    deletePayday
  }
};

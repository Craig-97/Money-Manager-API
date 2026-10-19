import mongoose from 'mongoose';

/*
 * Budgets used to store the ids of their notes, payments, bills and payday as well as each record
 * pointing back at its budget. Only the records' budget field is used now, so this takes the
 * stored copies off every budget. The API already ignores them, so it is tidying, not a fix.
 */

export const BUDGET_ID_FIELDS = ['bills', 'notes', 'oneOffPayments', 'recurringPayments', 'payday'];

const carriesAny = { $or: BUDGET_ID_FIELDS.map(field => ({ [field]: { $exists: true } })) };

export const removeBudgetIdLists = async ({ apply }: { apply: boolean }) => {
  const budgets = mongoose.connection.collection('budgets');
  const found = await budgets.countDocuments(carriesAny);
  if (!apply || found === 0) return { found, cleaned: 0 };

  const { modifiedCount } = await budgets.updateMany(carriesAny, {
    $unset: Object.fromEntries(BUDGET_ID_FIELDS.map(field => [field, '']))
  });
  return { found, cleaned: modifiedCount };
};

import mongoose from 'mongoose';

/*
 * Accounts used to store the ids of their notes, payments, bills and payday as well as each record
 * pointing back at its account. Only the records' account field is used now, so this takes the
 * stored copies off every account. The API already ignores them, so it is tidying, not a fix.
 */

export const ACCOUNT_ID_FIELDS = ['bills', 'notes', 'oneOffPayments', 'recurringPayments', 'payday'];

const carriesAny = { $or: ACCOUNT_ID_FIELDS.map(field => ({ [field]: { $exists: true } })) };

export const removeAccountIdLists = async ({ apply }: { apply: boolean }) => {
  const accounts = mongoose.connection.collection('accounts');
  const found = await accounts.countDocuments(carriesAny);
  if (!apply || found === 0) return { found, cleaned: 0 };

  const { modifiedCount } = await accounts.updateMany(carriesAny, {
    $unset: Object.fromEntries(ACCOUNT_ID_FIELDS.map(field => [field, '']))
  });
  return { found, cleaned: modifiedCount };
};

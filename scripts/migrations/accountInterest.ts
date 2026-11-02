import mongoose from 'mongoose';

/*
 * Accounts used to keep a rate that was only shown, as interestRate. It's now part of interest,
 * which can also say when it's paid. A rate carries over with no schedule, so it's still shown only
 * until the user says when it's paid; no rate means no interest.
 *
 * Only accounts that still carry interestRate are changed, so running it again does nothing.
 */

export interface AccountInterestResult {
  found: number;
  // How many had a rate to carry over
  withRate: number;
  changed: number;
}

interface StoredAccount {
  _id: mongoose.Types.ObjectId;
  interestRate?: number | null;
}

export const migrateAccountInterest = async ({ apply }: { apply: boolean }) => {
  const accounts = mongoose.connection.collection<StoredAccount>('accounts');
  const found = await accounts.find({ interestRate: { $exists: true } }).toArray();

  const result: AccountInterestResult = { found: found.length, withRate: 0, changed: 0 };
  const writes = found.map(account => {
    const rate = account.interestRate ?? null;
    if (rate !== null) result.withRate += 1;
    return {
      updateOne: {
        filter: { _id: account._id },
        update: {
          $set: {
            interest: rate === null ? null : { rate, frequency: null, day: null, nextDate: null }
          },
          $unset: { interestRate: '' as const }
        }
      }
    };
  });

  if (apply && writes.length) {
    result.changed = (await accounts.bulkWrite(writes)).modifiedCount;
  }
  return result;
};

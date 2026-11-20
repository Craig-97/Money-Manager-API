import mongoose from 'mongoose';
import { ukDay } from '../../utils/dates';

/*
 * An account's history starts with an opening record at the balance it had then. Accounts from
 * before history get one now, at today's balance, so their history starts from today: earlier
 * payment records don't count towards it, as the balances typed in back then weren't kept.
 *
 * Only accounts with no opening record get one, so running it again does nothing.
 */

export interface AccountHistoryResult {
  // Accounts with no opening record
  found: number;
  changed: number;
}

interface StoredAccount {
  _id: mongoose.Types.ObjectId;
  budget: mongoose.Types.ObjectId;
  balance: number;
}

export const migrateAccountHistory = async ({ apply }: { apply: boolean }) => {
  const db = mongoose.connection;
  const records = db.collection('accountrecords');
  const opened = new Set(
    (await records.distinct('account', { kind: 'OPENING' })).map(id => String(id))
  );
  const accounts = (await db.collection<StoredAccount>('accounts').find().toArray()).filter(
    account => !opened.has(String(account._id))
  );

  const result: AccountHistoryResult = { found: accounts.length, changed: 0 };
  if (apply && accounts.length) {
    const now = new Date();
    result.changed = (
      await records.insertMany(
        accounts.map(account => ({
          budget: account.budget,
          account: account._id,
          kind: 'OPENING',
          date: ukDay(now),
          change: account.balance,
          balanceAfter: account.balance,
          createdAt: now
        }))
      )
    ).insertedCount;
  }
  return result;
};

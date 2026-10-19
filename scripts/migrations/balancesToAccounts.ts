import mongoose from 'mongoose';
import { AccountKind } from '../../constants/account/accountKind';

/*
 * Budgets used to hold the bank balance themselves. It lives on their accounts now: this gives each
 * budget without one a current account holding that balance, then takes the balance off the
 * budget. Run it after migrate:budget, which it relies on for the names. Running it again changes
 * nothing.
 */
export const balancesToAccounts = async ({ apply }: { apply: boolean }) => {
  const db = mongoose.connection.db;
  if (!db) throw new Error('Not connected to a database');
  const budgets = db.collection('budgets');
  const accounts = db.collection('accounts');

  const withCurrent = new Set(
    (await accounts.find({ kind: AccountKind.CURRENT }, { projection: { budget: 1 } }).toArray()).map(
      account => String(account.budget)
    )
  );
  const all = await budgets.find({}, { projection: { bankBalance: 1 } }).toArray();
  const needAccount = all.filter(budget => !withCurrent.has(String(budget._id)));
  const carryBalance = all.filter(budget => budget.bankBalance !== undefined);

  if (apply) {
    const now = new Date();
    if (needAccount.length) {
      await accounts.insertMany(
        needAccount.map(budget => ({
          budget: budget._id,
          name: 'Current account',
          kind: AccountKind.CURRENT,
          balance: typeof budget.bankBalance === 'number' ? budget.bankBalance : 0,
          counts: true,
          interestRate: null,
          purpose: null,
          balanceUpdatedAt: now,
          createdAt: now,
          updatedAt: now
        }))
      );
    }
    if (carryBalance.length) {
      await budgets.updateMany(
        { _id: { $in: carryBalance.map(budget => budget._id) } },
        { $unset: { bankBalance: '' } }
      );
    }
  }
  return { budgets: all.length, created: needAccount.length, cleared: carryBalance.length };
};

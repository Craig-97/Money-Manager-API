import mongoose from 'mongoose';
import { AccountKind } from '../../constants/account/accountKind';

/*
 * Budgets used to hold the bank balance themselves. It lives on their accounts now: this gives each
 * budget without one a spending account that pay lands in, holding that balance, then takes the
 * balance off the budget. A current account made before spending accounts existed becomes the
 * spending account pay lands in. Run it after migrate:budget, which it relies on for the names.
 * Running it again changes nothing.
 */
export const balancesToAccounts = async ({ apply }: { apply: boolean }) => {
  const db = mongoose.connection.db;
  if (!db) throw new Error('Not connected to a database');
  const budgets = db.collection('budgets');
  const accounts = db.collection('accounts');

  // Written before spending accounts, as the one current account per budget
  const current = await accounts.find({ kind: 'CURRENT' }, { projection: { budget: 1 } }).toArray();
  const withCurrent = new Set(
    (
      await accounts.find({ paidInto: true }, { projection: { budget: 1 } }).toArray()
    ).map(account => String(account.budget))
  );
  for (const account of current) withCurrent.add(String(account.budget));
  const all = await budgets.find({}, { projection: { bankBalance: 1 } }).toArray();
  const needAccount = all.filter(budget => !withCurrent.has(String(budget._id)));
  const carryBalance = all.filter(budget => budget.bankBalance !== undefined);

  if (apply) {
    const now = new Date();
    if (current.length) {
      await accounts.updateMany(
        { kind: 'CURRENT' },
        { $set: { kind: AccountKind.SPENDING, paidInto: true } }
      );
      // Its one-per-budget index went with it
      await accounts.dropIndex('one_current_account').catch(() => undefined);
    }
    if (needAccount.length) {
      await accounts.insertMany(
        needAccount.map(budget => ({
          budget: budget._id,
          name: 'Current account',
          kind: AccountKind.SPENDING,
          paidInto: true,
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
  return {
    budgets: all.length,
    created: needAccount.length,
    cleared: carryBalance.length,
    converted: current.length
  };
};

import mongoose from 'mongoose';

/*
 * Once a budget has more than one account to spend from, every recurring expense says which it goes
 * out of. Budgets that got their second before that was so can have expenses that don't: they're
 * recorded on where pay lands, which is where they've been going out of.
 *
 * Only expenses with no account are changed, so running it again does nothing.
 */

export interface PaymentAccountsResult {
  // Budgets with more than one account to spend from
  budgets: number;
  // Their recurring expenses with no account
  found: number;
  changed: number;
}

interface StoredAccount {
  _id: mongoose.Types.ObjectId;
  budget: mongoose.Types.ObjectId;
  paidInto?: boolean;
}

export const migratePaymentAccounts = async ({ apply }: { apply: boolean }) => {
  const db = mongoose.connection;
  const spending = await db
    .collection<StoredAccount>('accounts')
    .find({ kind: 'SPENDING' })
    .toArray();
  const byBudget = new Map<string, StoredAccount[]>();
  for (const account of spending) {
    const key = String(account.budget);
    byBudget.set(key, [...(byBudget.get(key) ?? []), account]);
  }

  const result: PaymentAccountsResult = { budgets: 0, found: 0, changed: 0 };
  const payments = db.collection('recurringpayments');
  for (const accounts of byBudget.values()) {
    const paidInto = accounts.find(account => account.paidInto);
    if (accounts.length < 2 || !paidInto) continue;
    result.budgets += 1;
    const filter = { budget: paidInto.budget, type: 'EXPENSE', account: null };
    result.found += await payments.countDocuments(filter);
    if (apply) {
      result.changed += (await payments.updateMany(filter, { $set: { account: paidInto._id } }))
        .modifiedCount;
    }
  }
  return result;
};

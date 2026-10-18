import mongoose, { Types } from 'mongoose';

/*
 * Recurring payments used to keep what was paid or skipped this cycle in a handled list on the
 * payment, cleared each payday. Payment records replace it, so each entry becomes an open record
 * (the list only ever held the current cycle) and the list is taken off the payment.
 *
 * Entries from before amounts were recorded take the payment's current amount, which is what undo
 * would have used for them. Each record is dated by the last date it covers.
 */

interface HandledEntry {
  outcome: 'PAID' | 'SKIPPED';
  dates: Date[];
  amount?: number;
  debtReduction?: number;
}

interface StoredPayment {
  _id: Types.ObjectId;
  account: Types.ObjectId;
  name: string;
  category: string;
  type: 'INCOME' | 'EXPENSE';
  amount: number;
  debt?: { balance: number } | null;
  handled?: HandledEntry[];
}

const carriesHandled = { handled: { $exists: true } };

export const moveHandledToRecords = async ({ apply }: { apply: boolean }) => {
  const payments = mongoose.connection.collection<StoredPayment>('recurringpayments');
  const records = mongoose.connection.collection('paymentrecords');

  const found = await payments.find(carriesHandled).toArray();
  const entries = found.flatMap(payment =>
    (payment.handled ?? []).map(entry => {
      const amount = entry.amount ?? payment.amount;
      const paid = entry.outcome === 'PAID';
      return {
        account: payment.account,
        recurringPayment: payment._id,
        oneOffPayment: null,
        payment: { name: payment.name, category: payment.category, type: payment.type },
        kind: entry.outcome,
        dates: entry.dates,
        balanceChange: paid ? (payment.type === 'INCOME' ? amount : -amount) : 0,
        ...(paid && entry.debtReduction != null
          ? { debt: { interest: 0, reduction: entry.debtReduction, balanceAfter: payment.debt?.balance ?? 0 } }
          : {}),
        open: true,
        createdAt: entry.dates[entry.dates.length - 1] ?? new Date(),
        __v: 0
      };
    })
  );

  if (!apply) return { payments: found.length, records: entries.length, moved: 0 };

  if (entries.length) await records.insertMany(entries);
  const { modifiedCount } = await payments.updateMany(carriesHandled, { $unset: { handled: '' } });
  return { payments: found.length, records: entries.length, moved: modifiedCount };
};

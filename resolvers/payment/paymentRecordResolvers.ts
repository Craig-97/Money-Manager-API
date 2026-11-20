import type { ClientSession, Types } from 'mongoose';
import { PaymentRecordKind } from '../../constants/payment/paymentRecordKind';
import type { PaymentType } from '../../constants/payment/paymentType';
import { PaymentRecord } from '../../models/payment/PaymentRecord';
import type { Debt, RecurringPaymentDocument } from '../../models/payment/RecurringPayment';
import { debtAccruedTo, roundPence, ukDay } from '../../utils';

type RecordDocument = InstanceType<typeof PaymentRecord>;

// What a record keeps of the payment it's about
export const snapshotOf = (payment: { name: string; category: string; type: PaymentType }) => ({
  name: payment.name,
  category: payment.category,
  type: payment.type
});

/*
 * Notes a debt's balance being set by hand: when it's first tracked, or corrected from a statement.
 * The reduction says how far it moved from what the app had worked out.
 */
export const recordBalanceSet = (
  payment: RecurringPaymentDocument,
  previousBalance: number | null,
  session: ClientSession
) => {
  const balance = payment.debt?.balance ?? 0;
  return new PaymentRecord({
    budget: payment.budget,
    recurringPayment: payment._id,
    payment: snapshotOf(payment),
    kind: PaymentRecordKind.BALANCE_SET,
    dates: [ukDay()],
    balanceChange: 0,
    debt: {
      interest: 0,
      reduction: roundPence((previousBalance ?? balance) - balance),
      balanceAfter: balance
    }
  }).save({ session });
};

const CYCLE_KINDS: PaymentRecordKind[] = [PaymentRecordKind.PAID, PaymentRecordKind.SKIPPED];
// What brings a debt down since payday: its payments and anything paid on top
const PAID_OFF_KINDS: PaymentRecordKind[] = [PaymentRecordKind.PAID, PaymentRecordKind.OVERPAYMENT];
const OPEN_KINDS = [...CYCLE_KINDS, PaymentRecordKind.OVERPAYMENT];
const NEWEST_FIRST = { createdAt: -1, _id: -1 } as const;

// The latest open pay or skip on a recurring payment: the one undo takes back
export const latestOpenRecord = (
  recurringPayment: Types.ObjectId | string,
  session?: ClientSession
) =>
  PaymentRecord.findOne({ recurringPayment, open: true, kind: { $in: CYCLE_KINDS } })
    .sort(NEWEST_FIRST)
    .session(session ?? null);

// Open pays, skips and overpayments, oldest first, grouped by payment
const openRecords = async (ids: Types.ObjectId[]) => {
  const records = await PaymentRecord.find({
    recurringPayment: { $in: ids },
    open: true,
    kind: { $in: OPEN_KINDS }
  })
    .sort({ createdAt: 1, _id: 1 })
    .exec();
  const byPayment = new Map<string, RecordDocument[]>();
  for (const record of records) {
    const key = String(record.recurringPayment);
    byPayment.set(key, [...(byPayment.get(key) ?? []), record]);
  }
  return byPayment;
};

/*
 * Loads the open records of a list of payments in one query, so a budget's payments don't each
 * run their own
 */
export const withThisCycle = async (payments: RecurringPaymentDocument[]) => {
  const byPayment = await openRecords(payments.map(payment => payment._id));
  for (const payment of payments) payment.$locals.openRecords = byPayment.get(payment.id) ?? [];
  return payments;
};

// A payment's open records, loaded with the rest of the budget's or on their own
const openRecordsOf = async (payment: RecurringPaymentDocument) =>
  (payment.$locals.openRecords as RecordDocument[] | undefined) ??
  (await openRecords([payment._id])).get(payment.id) ??
  [];

// Its pays and skips this cycle, oldest first, as the dashboard reads them
const thisCycle = async (payment: RecurringPaymentDocument) =>
  (await openRecordsOf(payment)).filter(record => CYCLE_KINDS.includes(record.kind));

type DebtDocument = Debt & { ownerDocument: () => RecurringPaymentDocument };

/*
 * How much less the debt owes since payday: what its payments took off after interest, and its
 * overpayments. Undoing either takes it back out.
 */
const paidOffThisCycle = async (debt: DebtDocument) =>
  roundPence(
    (await openRecordsOf(debt.ownerDocument()))
      .filter(record => PAID_OFF_KINDS.includes(record.kind))
      .reduce((sum, record) => sum + (record.debt?.reduction ?? 0), 0)
  );

const MAX_HISTORY = 200;

// The year a record shows under: the last date it covers, as the app dates it
const yearOf = (record: Pick<RecordDocument, 'dates' | 'createdAt'>) =>
  (record.dates.at(-1) ?? record.createdAt).getUTCFullYear();

/*
 * Everything that's happened to a payment, newest first: the latest `limit` of them, or all of one
 * year's. Records covering several dates go in the year of the last.
 */
const history = async (
  payment: RecurringPaymentDocument,
  { limit, year }: { limit?: number | null; year?: number | null }
) => {
  if (year == null) {
    return PaymentRecord.find({ recurringPayment: payment._id })
      .sort(NEWEST_FIRST)
      .limit(Math.min(Math.max(limit ?? 50, 1), MAX_HISTORY))
      .exec();
  }
  // Any record with a date in the year, then only those whose last date is in it
  const records = await PaymentRecord.find({
    recurringPayment: payment._id,
    dates: {
      $elemMatch: { $gte: new Date(Date.UTC(year, 0, 1)), $lt: new Date(Date.UTC(year + 1, 0, 1)) }
    }
  })
    .sort(NEWEST_FIRST)
    .exec();
  return records.filter(record => yearOf(record) === year).slice(0, MAX_HISTORY);
};

// The years it has records in, newest first, so the app can page through them
const historyYears = async (payment: RecurringPaymentDocument) => {
  const records = await PaymentRecord.find({ recurringPayment: payment._id })
    .select({ dates: 1, createdAt: 1 })
    .exec();
  return [...new Set(records.map(yearOf))].sort((a, b) => b - a);
};

export const paymentRecordResolvers = {
  RecurringPayment: { thisCycle, history, historyYears },
  // The account its money went out of or came into, as an id; none on records from before accounts
  PaymentRecord: {
    account: (record: RecordDocument) => (record.account ? String(record.account) : null)
  },
  Debt: {
    paidOffThisCycle,
    // Interest built up since the last payment, and from when: one that hasn't been counted yet
    // counts from the last payment, or when the balance was set
    accrued: (debt: DebtDocument) => debt.accrued ?? 0,
    accruedTo: (debt: DebtDocument) => debtAccruedTo(debt.ownerDocument())
  }
};

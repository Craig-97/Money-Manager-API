import mongoose, { Schema, Types } from 'mongoose';
import { PaymentRecordKind } from '../../constants/payment/paymentRecordKind';
import { PaymentType } from '../../constants/payment/paymentType';
import { enumValues } from '../../utils/helpers/enumHelpers';

// What a payment was when the record was made, so the record still reads right after the payment
// is renamed, or a paid one-off is cleared away at payday
export interface PaymentSnapshot {
  name: string;
  category: string;
  type: PaymentType;
}

// What a record did to a debt
export interface RecordDebt {
  // Interest added for the period, estimated from the APR (0 for overpayments and balance changes)
  interest: number;
  // How much less is owed afterwards; negative when the balance went up
  reduction: number;
  balanceAfter: number;
}

/*
 * Something that happened to a payment: a date paid or skipped, an overpayment, or a debt's balance
 * set by hand. These are the history, and the open ones are the current cycle: what the dashboard
 * shows as paid or skipped, and what can be undone. Undoing deletes the record, so a mistake leaves
 * nothing behind. Payday closes the cycle's records, and they stay as history.
 */
export interface PaymentRecord {
  account: Types.ObjectId;
  recurringPayment?: Types.ObjectId | null;
  oneOffPayment?: Types.ObjectId | null;
  payment: PaymentSnapshot;
  kind: PaymentRecordKind;
  // The due dates it covers; today for an overpayment or a balance change
  dates: Date[];
  // What it did to the bank balance: negative for money out, 0 when it left it alone
  balanceChange: number;
  debt?: RecordDebt | null;
  // Still in the current cycle, so it can be undone. Payday, or a change to the payment's
  // schedule, closes it.
  open: boolean;
  createdAt: Date;
}

const snapshotSchema = new Schema<PaymentSnapshot>(
  {
    name: { type: String, required: true },
    category: { type: String, required: true },
    type: { type: String, enum: enumValues(PaymentType), required: true }
  },
  { _id: false }
);

const recordDebtSchema = new Schema<RecordDebt>(
  {
    interest: { type: Number, required: true },
    reduction: { type: Number, required: true },
    balanceAfter: { type: Number, required: true }
  },
  { _id: false }
);

const paymentRecordSchema = new Schema<PaymentRecord>(
  {
    account: { type: Schema.Types.ObjectId, ref: 'Account', required: true },
    recurringPayment: { type: Schema.Types.ObjectId, ref: 'RecurringPayment', default: null },
    oneOffPayment: { type: Schema.Types.ObjectId, ref: 'OneOffPayment', default: null },
    payment: { type: snapshotSchema, required: true },
    kind: { type: String, enum: enumValues(PaymentRecordKind), required: true },
    dates: { type: [Date], required: true },
    balanceChange: { type: Number, required: true },
    debt: { type: recordDebtSchema, default: undefined },
    open: { type: Boolean, default: true }
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

// A cycle's records, for the dashboard and payday
paymentRecordSchema.index({ account: 1, open: 1 });
// A payment's history and its latest record, newest first
paymentRecordSchema.index({ recurringPayment: 1, createdAt: -1 });
paymentRecordSchema.index({ oneOffPayment: 1 });

export const PaymentRecord = mongoose.model<PaymentRecord>('PaymentRecord', paymentRecordSchema);

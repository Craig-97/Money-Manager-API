import mongoose, { Schema, Types } from 'mongoose';
import { AccountRecordKind } from '../../constants/account/accountRecordKind';
import { enumValues } from '../../utils/helpers/enumHelpers';

/*
 * Something that changed an account's balance other than a payment: its opening balance, a balance
 * typed in, or interest added. With the payment records that moved money in or out of it, these
 * are the account's history. Each one keeps the balance it left, so a typed-in balance is known
 * exactly and the rest can be worked out from it.
 */
export interface AccountRecord {
  budget: Types.ObjectId;
  account: Types.ObjectId;
  kind: AccountRecordKind;
  // The day it happened: today, or the day interest was paid
  date: Date;
  // How far it moved the balance; the whole balance for an opening one
  change: number;
  balanceAfter: number;
  createdAt: Date;
}

const accountRecordSchema = new Schema<AccountRecord>(
  {
    budget: { type: Schema.Types.ObjectId, ref: 'Budget', required: true },
    account: { type: Schema.Types.ObjectId, ref: 'Account', required: true },
    kind: { type: String, enum: enumValues(AccountRecordKind), required: true },
    date: { type: Date, required: true },
    change: { type: Number, required: true },
    balanceAfter: { type: Number, required: true }
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

// An account's history, newest first
accountRecordSchema.index({ account: 1, createdAt: -1 });
accountRecordSchema.index({ budget: 1 });

export const AccountRecord = mongoose.model<AccountRecord>('AccountRecord', accountRecordSchema);

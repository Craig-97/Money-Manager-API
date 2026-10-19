import mongoose, { Schema, Types } from 'mongoose';
import { AccountKind } from '../../constants/account/accountKind';

/*
 * A bank account in a budget: one to spend from, or savings. Balances are typed in by the user,
 * never linked to a bank. They also move as payments out of or into them are marked paid.
 */
export interface Account {
  budget: Types.ObjectId;
  name: string;
  kind: AccountKind;
  balance: number;
  // Part of free to spend: the bank balance on the dashboard is the sum of those that count
  counts: boolean;
  // Where pay lands: one spending account per budget. Payments that don't say which account they
  // use go out of it too.
  paidInto: boolean;
  // Shown only, never added to the balance
  interestRate?: number | null;
  // What it's for, e.g. "Holiday fund"
  purpose?: string | null;
  // When the user last set the balance, so the app can say how old it is
  balanceUpdatedAt: Date;
}

const AccountSchema = new Schema<Account>(
  {
    budget: { type: Schema.Types.ObjectId, ref: 'Budget', required: [true, 'Budget ID required'] },
    name: { type: String, required: [true, 'Name required'] },
    kind: { type: String, enum: Object.values(AccountKind), required: true },
    balance: { type: Number, required: true },
    counts: { type: Boolean, required: true },
    paidInto: { type: Boolean, default: false },
    interestRate: { type: Number, default: null },
    purpose: { type: String, default: null },
    balanceUpdatedAt: { type: Date, required: true }
  },
  { timestamps: true }
);

// For a budget's accounts, oldest first
AccountSchema.index({ budget: 1, createdAt: 1 });

// One account per budget where pay lands
AccountSchema.index(
  { budget: 1 },
  { unique: true, partialFilterExpression: { paidInto: true }, name: 'one_paid_into_account' }
);

export const Account = mongoose.model<Account>('Account', AccountSchema);

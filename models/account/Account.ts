import mongoose, { Schema, Types } from 'mongoose';
import { AccountKind } from '../../constants/account/accountKind';

/*
 * A bank account in a budget: its current account, or savings. Balances are typed in by the user,
 * never linked to a bank. The current account also moves as payments are marked paid, and savings
 * as payments into them are.
 */
export interface Account {
  budget: Types.ObjectId;
  name: string;
  kind: AccountKind;
  balance: number;
  // Part of free to spend: the bank balance on the dashboard is the sum of those that count
  counts: boolean;
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
    interestRate: { type: Number, default: null },
    purpose: { type: String, default: null },
    balanceUpdatedAt: { type: Date, required: true }
  },
  { timestamps: true }
);

// For a budget's accounts, oldest first
AccountSchema.index({ budget: 1, createdAt: 1 });

// One current account per budget
AccountSchema.index(
  { budget: 1 },
  { unique: true, partialFilterExpression: { kind: AccountKind.CURRENT }, name: 'one_current_account' }
);

export const Account = mongoose.model<Account>('Account', AccountSchema);

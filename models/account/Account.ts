import mongoose, { Schema, Types } from 'mongoose';
import { AccountKind } from '../../constants/account/accountKind';
import { InterestFrequency } from '../../constants/account/interestFrequency';

/*
 * A savings account's interest. With a frequency it's worked out on each day's closing balance and
 * added on the day it's paid; without one the rate is shown only.
 */
export interface AccountInterest {
  // AER, as a percentage
  rate: number;
  frequency?: InterestFrequency | null;
  // The day of the month it's paid on, kept so a 31st stays the last day of shorter months
  day?: number | null;
  // When it's next paid. None once a fixed-term account has matured.
  nextDate?: Date | null;
  // What's built up since it was last paid, unrounded, and the first day not yet counted in it.
  // No date yet means it counts from the last payment.
  accrued?: number;
  accruedTo?: Date | null;
}

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
  // Savings only
  interest?: AccountInterest | null;
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
    interest: {
      type: new Schema<AccountInterest>(
        {
          rate: { type: Number, required: true },
          frequency: { type: String, enum: Object.values(InterestFrequency), default: null },
          day: { type: Number, default: null },
          nextDate: { type: Date, default: null },
          accrued: { type: Number, default: 0 },
          accruedTo: { type: Date, default: null }
        },
        { _id: false }
      ),
      default: null
    },
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

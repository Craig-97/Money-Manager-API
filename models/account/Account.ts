import mongoose, { Schema, Types } from 'mongoose';

export interface Account {
  bankBalance?: number;
  monthlyIncome?: number;
  user?: Types.ObjectId;
  // The payday the current cycle was started on, so the payday prompt only shows once per payday
  cycleStartedOn?: Date;
}

// First define the schema
const AccountSchema = new Schema<Account>({
  bankBalance: Number,
  monthlyIncome: Number,
  user: { type: Schema.Types.ObjectId, ref: 'User' },
  cycleStartedOn: Date
});

// Used for ensuring one account per user and quick user->account lookups
AccountSchema.index({ user: 1 }, { unique: true });

// What's on an account is found through each record's own account field, so there's only one link
// to keep right. These fill in when populated, e.g. .populate('notes').
const onAccount = (ref: string, justOne = false) => ({
  ref,
  localField: '_id',
  foreignField: 'account',
  justOne
});

AccountSchema.virtual('notes', onAccount('Note'));
AccountSchema.virtual('oneOffPayments', onAccount('OneOffPayment'));
AccountSchema.virtual('recurringPayments', onAccount('RecurringPayment'));
AccountSchema.virtual('payday', onAccount('Payday', true));

// Create and export the model using the schema
export const Account = mongoose.model<Account>('Account', AccountSchema);

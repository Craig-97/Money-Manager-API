import mongoose, { Schema, Types } from 'mongoose';

export interface Account {
  bankBalance?: number;
  monthlyIncome?: number;
  user?: Types.ObjectId;
  bills: Types.Array<Types.ObjectId>;
  oneOffPayments: Types.Array<Types.ObjectId>;
  recurringPayments: Types.Array<Types.ObjectId>;
  notes: Types.Array<Types.ObjectId>;
  payday?: Types.ObjectId;
}

// First define the schema
const AccountSchema = new Schema<Account>({
  bankBalance: Number,
  monthlyIncome: Number,
  user: { type: Schema.Types.ObjectId, ref: 'User' },
  bills: [{ type: Schema.Types.ObjectId, ref: 'Bill' }],
  oneOffPayments: [{ type: Schema.Types.ObjectId, ref: 'OneOffPayment' }],
  recurringPayments: [{ type: Schema.Types.ObjectId, ref: 'RecurringPayment' }],
  notes: [{ type: Schema.Types.ObjectId, ref: 'Note' }],
  payday: { type: Schema.Types.ObjectId, ref: 'Payday' }
});

// Used for ensuring one account per user and quick user->account lookups
AccountSchema.index({ user: 1 }, { unique: true });

// Used for quick access to account's bills during population
AccountSchema.index({ bills: 1 });

// Used for quick access to account's payments during population
AccountSchema.index({ oneOffPayments: 1 });

// Used for quick access to account's notes during population
AccountSchema.index({ notes: 1 });

// Add index for recurring payments
AccountSchema.index({ recurringPayments: 1 });

// Create and export the model using the schema
export const Account = mongoose.model<Account>('Account', AccountSchema);

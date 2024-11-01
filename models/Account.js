import mongoose from 'mongoose';
const Schema = mongoose.Schema;

export const Account = mongoose.model('Account', {
  bankBalance: Number,
  monthlyIncome: Number,
  user: { type: Schema.Types.ObjectId, ref: 'User' },
  bills: [{ type: Schema.Types.ObjectId, ref: 'Bill' }],
  oneOffPayments: [{ type: Schema.Types.ObjectId, ref: 'OneOffPayment' }],
  notes: [{ type: Schema.Types.ObjectId, ref: 'Note' }],
  payday: { type: Schema.Types.ObjectId, ref: 'Payday' }
});

// Used for ensuring one account per user and quick user->account lookups
AccountSchema.index({ user: 1 }, { unique: true });

// Used for auth checks and account lookups during bill/payment/note operations
AccountSchema.index({ _id: 1 });

// Used for quick access to account's bills during population
AccountSchema.index({ bills: 1 });

// Used for quick access to account's payments during population
AccountSchema.index({ oneOffPayments: 1 });

// Used for quick access to account's notes during population
AccountSchema.index({ notes: 1 });

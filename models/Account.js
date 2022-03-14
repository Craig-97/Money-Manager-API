import mongoose from 'mongoose';
const Schema = mongoose.Schema;

export const Account = mongoose.model('Account', {
  bankBalance: Number,
  monthlyIncome: Number,
  bankPaydayTotal: Number,
  bills: [{ type: Schema.Types.ObjectId, ref: 'Bill' }],
  oneOffPayments: [{ type: Schema.Types.ObjectId, ref: 'OneOffPayment' }]
});

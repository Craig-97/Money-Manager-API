import mongoose from 'mongoose';
const Schema = mongoose.Schema;

export const OneOffPayment = mongoose.model('OneOffPayment', {
  name: String,
  amount: Number,
  account: {
    type: Schema.Types.ObjectId,
    ref: 'Account',
    required: 'Account ID required'
  }
});

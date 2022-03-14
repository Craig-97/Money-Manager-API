import mongoose from 'mongoose';
const Schema = mongoose.Schema;

export const Bill = mongoose.model('Bill', {
  name: String,
  amount: Number,
  paid: Boolean,
  account: {
    type: Schema.Types.ObjectId,
    ref: 'Account',
    required: 'Account ID required'
  }
});

import mongoose from 'mongoose';
const Schema = mongoose.Schema;

export const OneOffPaymentSchema = new Schema({
  name: String,
  amount: Number,
  account: {
    type: Schema.Types.ObjectId,
    ref: 'Account',
    required: 'Account ID required'
  }
});

// Used to ensure unique payment names within an account
// Also speeds up duplicate name checks during creation
OneOffPaymentSchema.index({ name: 1, account: 1 }, { unique: true });

// Used for quick lookups during edit/delete operations
// Also helps with auth checks that need both ID and account
OneOffPaymentSchema.index({ _id: 1, account: 1 });

// Used for finding all payments belonging to an account
// Helps with batch operations and account population
OneOffPaymentSchema.index({ account: 1 });

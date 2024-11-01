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

// Used to ensure unique bill names within an account
// Also speeds up duplicate name checks during creation
BillSchema.index({ name: 1, account: 1 }, { unique: true });

// Used for quick lookups during edit/delete operations
// Also helps with auth checks that need both ID and account
BillSchema.index({ _id: 1, account: 1 });

// Used for finding all bills belonging to an account
// Helps with batch operations and account population
BillSchema.index({ account: 1 });

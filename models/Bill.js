import mongoose from 'mongoose';
const Schema = mongoose.Schema;

const BillSchema = new Schema({
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

// Used for finding all bills belonging to an account
// Helps with batch operations and account population
BillSchema.index({ account: 1 });

// Create and export the model using the schema
export const Bill = mongoose.model('Bill', BillSchema);

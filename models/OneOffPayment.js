import mongoose from 'mongoose';
const Schema = mongoose.Schema;

const OneOffPaymentSchema = new Schema({
  name: String,
  amount: Number,
  account: {
    type: Schema.Types.ObjectId,
    ref: 'Account',
    required: 'Account ID required'
  }
});

// Add indexes to the schema
// Used to ensure unique payment names within an account
// Also speeds up duplicate name checks during creation
OneOffPaymentSchema.index({ name: 1, account: 1 }, { unique: true });

// Used for finding all payments belonging to an account
// Helps with batch operations and account population
OneOffPaymentSchema.index({ account: 1 });

// Create and export the model using the schema
export const OneOffPayment = mongoose.model('OneOffPayment', OneOffPaymentSchema);

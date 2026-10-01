import mongoose from 'mongoose';
const Schema = mongoose.Schema;

const PaymentCategory = {
  TRANSFER: 'TRANSFER',
  INVESTMENT: 'INVESTMENT',
  FEES: 'FEES',
  TAXES: 'TAXES',
  HOME: 'HOME',
  UTILITIES: 'UTILITIES',
  VEHICLE: 'VEHICLE',
  TRAVEL: 'TRAVEL',
  TRANSPORT: 'TRANSPORT',
  FOOD: 'FOOD',
  SHOPPING: 'SHOPPING',
  ENTERTAINMENT: 'ENTERTAINMENT',
  HEALTHCARE: 'HEALTHCARE',
  EDUCATION: 'EDUCATION',
  GIFT: 'GIFT',
  PETS: 'PETS',
  SALARY: 'SALARY',
  BUSINESS: 'BUSINESS',
  CHARITY: 'CHARITY',
  OTHER: 'OTHER'
};

const OneOffPaymentSchema = new Schema({
  name: {
    type: String,
    required: true
  },
  amount: {
    type: Number,
    required: true
  },
  account: {
    type: Schema.Types.ObjectId,
    ref: 'Account',
    required: 'Account ID required'
  },
  dueDate: Date,
  type: {
    type: String,
    enum: ['INCOME', 'EXPENSE'],
    required: true
  },
  category: {
    type: String,
    enum: Object.values(PaymentCategory),
    required: true
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

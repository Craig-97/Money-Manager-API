const mongoose = require('mongoose');
const Schema = mongoose.Schema;

const PaymentCategory = {
  MORTGAGE: 'MORTGAGE',
  RENT: 'RENT',
  UTILITIES: 'UTILITIES',
  HOME_MAINTENANCE: 'HOME_MAINTENANCE',
  VEHICLE: 'VEHICLE',
  TRANSPORT: 'TRANSPORT',
  LOAN: 'LOAN',
  CREDIT_CARD: 'CREDIT_CARD',
  SAVINGS: 'SAVINGS',
  INVESTMENT: 'INVESTMENT',
  INSURANCE: 'INSURANCE',
  HEALTHCARE: 'HEALTHCARE',
  CHILDCARE: 'CHILDCARE',
  EDUCATION: 'EDUCATION',
  SUBSCRIPTION: 'SUBSCRIPTION',
  MEMBERSHIP: 'MEMBERSHIP',
  FOOD: 'FOOD',
  CHARITY: 'CHARITY',
  BUSINESS: 'BUSINESS',
  OTHER: 'OTHER'
};

const PaymentFrequency = {
  WEEKLY: 'WEEKLY',
  BIWEEKLY: 'BIWEEKLY',
  MONTHLY: 'MONTHLY',
  QUARTERLY: 'QUARTERLY',
  ANNUALLY: 'ANNUALLY'
};

const recurringPaymentSchema = new Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  account: {
    type: Schema.Types.ObjectId,
    ref: 'Account',
    required: 'Account ID required'
  },
  category: {
    type: String,
    required: true,
    enum: Object.values(PaymentCategory)
  },
  frequency: {
    type: String,
    required: true,
    enum: Object.values(PaymentFrequency)
  },
  type: {
    type: String,
    enum: ['INCOME', 'EXPENSE'],
    required: true
  },
  firstPaymentDate: {
    type: Date,
    required: true
  },
  lastPaymentDate: {
    type: Date
  }
});

export const RecurringPayment = mongoose.model('RecurringPayment', recurringPaymentSchema);

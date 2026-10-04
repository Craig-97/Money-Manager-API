import mongoose, { Schema, Types } from 'mongoose';
import { PaymentStatus } from '../constants/paymentStatus';
import { PaymentType } from '../constants/paymentType';
import { nextOccurrence, ukDay } from '../utils/dates';
import { enumValues } from '../utils/helpers/enumHelpers';

export const RecurringPaymentCategory = {
  MORTGAGE: 'MORTGAGE',
  RENT: 'RENT',
  UTILITIES: 'UTILITIES',
  HOME_MAINTENANCE: 'HOME_MAINTENANCE',
  TAX: 'TAX',
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
} as const;

export type RecurringPaymentCategory =
  (typeof RecurringPaymentCategory)[keyof typeof RecurringPaymentCategory];

export const PaymentFrequency = {
  WEEKLY: 'WEEKLY',
  BIWEEKLY: 'BIWEEKLY',
  MONTHLY: 'MONTHLY',
  QUARTERLY: 'QUARTERLY',
  ANNUALLY: 'ANNUALLY'
} as const;

export type PaymentFrequency = (typeof PaymentFrequency)[keyof typeof PaymentFrequency];


export interface RecurringPayment {
  name: string;
  amount: number;
  account: Types.ObjectId;
  category: RecurringPaymentCategory;
  frequency: PaymentFrequency;
  type: PaymentType;
  firstPaymentDate: Date;
  lastPaymentDate?: Date;
  // The date the payment is due this cycle; null once its last payment has passed
  nextDueDate?: Date | null;
  status: PaymentStatus;
}

const recurringPaymentSchema = new Schema<RecurringPayment>({
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
    required: [true, 'Account ID required']
  },
  category: {
    type: String,
    required: true,
    enum: enumValues(RecurringPaymentCategory)
  },
  frequency: {
    type: String,
    required: true,
    enum: enumValues(PaymentFrequency)
  },
  type: {
    type: String,
    enum: enumValues(PaymentType),
    required: true
  },
  firstPaymentDate: {
    type: Date,
    required: true
  },
  lastPaymentDate: {
    type: Date
  },
  nextDueDate: {
    type: Date,
    default: null
  },
  status: {
    type: String,
    enum: enumValues(PaymentStatus),
    default: PaymentStatus.UNPAID
  }
});

// A new payment, or one whose schedule changed, is due on its next date from today and starts
// unpaid. Updates go through save() so this runs for them too.
recurringPaymentSchema.pre('validate', function () {
  const scheduleChanged =
    this.isNew ||
    this.isModified('firstPaymentDate') ||
    this.isModified('frequency') ||
    this.isModified('lastPaymentDate');
  if (!scheduleChanged) return;

  this.nextDueDate = nextOccurrence(this, ukDay());
  if (!this.isModified('status')) this.status = PaymentStatus.UNPAID;
});

export const RecurringPayment = mongoose.model<RecurringPayment>('RecurringPayment', recurringPaymentSchema);

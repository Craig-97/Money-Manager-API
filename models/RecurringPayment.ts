import mongoose, { Schema, Types } from 'mongoose';
import { PaymentType } from '../constants/paymentType';
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
  }
});

export const RecurringPayment = mongoose.model<RecurringPayment>('RecurringPayment', recurringPaymentSchema);

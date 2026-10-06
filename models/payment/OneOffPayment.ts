import mongoose, { Schema, Types } from 'mongoose';
import { OneOffPaymentCategory } from '../../constants/payment';
import { PaymentType } from '../../constants/payment/paymentType';
import { enumValues } from '../../utils/helpers/enumHelpers';

export interface OneOffPayment {
  name: string;
  amount: number;
  account: Types.ObjectId;
  dueDate?: Date;
  type: PaymentType;
  category: OneOffPaymentCategory;
}

const OneOffPaymentSchema = new Schema<OneOffPayment>({
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
    required: [true, 'Account ID required']
  },
  dueDate: Date,
  type: {
    type: String,
    enum: enumValues(PaymentType),
    required: true
  },
  category: {
    type: String,
    enum: enumValues(OneOffPaymentCategory),
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
export const OneOffPayment = mongoose.model<OneOffPayment>('OneOffPayment', OneOffPaymentSchema);

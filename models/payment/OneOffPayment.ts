import mongoose, { Schema, Types } from 'mongoose';
import { PaymentCategory } from '../../constants/payment';
import { PaymentType } from '../../constants/payment/paymentType';
import { enumValues } from '../../utils/helpers/enumHelpers';
import { reminderTimingSchema, USUAL_TIMING, type ReminderTiming } from '../reminder/reminderTiming';

export interface OneOffPayment {
  name: string;
  amount: number;
  budget: Types.ObjectId;
  dueDate?: Date;
  type: PaymentType;
  category: PaymentCategory;
  // When it was marked paid. A paid one-off stays until the next payday, so it can still be undone,
  // then payday clears it away; its record stays as history.
  paidAt?: Date | null;
  // When the reminder before it's due goes off
  dueReminder: ReminderTiming;
  // The account it goes out of, or comes into. None means the one pay lands in.
  account?: Types.ObjectId | null;
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
  budget: {
    type: Schema.Types.ObjectId,
    ref: 'Budget',
    required: [true, 'Budget ID required']
  },
  dueDate: Date,
  type: {
    type: String,
    enum: enumValues(PaymentType),
    required: true
  },
  category: {
    type: String,
    enum: enumValues(PaymentCategory),
    required: true
  },
  paidAt: {
    type: Date,
    default: null
  },
  dueReminder: {
    type: reminderTimingSchema,
    default: () => ({ ...USUAL_TIMING })
  },
  account: { type: Schema.Types.ObjectId, ref: 'Account', default: null }
});

// Add indexes to the schema
// Used to ensure unique payment names within a budget
// Also speeds up duplicate name checks during creation
OneOffPaymentSchema.index({ name: 1, budget: 1 }, { unique: true });

// Used for finding all payments belonging to a budget
// Helps with batch operations and budget population
OneOffPaymentSchema.index({ budget: 1 });

// Create and export the model using the schema
export const OneOffPayment = mongoose.model<OneOffPayment>('OneOffPayment', OneOffPaymentSchema);

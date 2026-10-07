import mongoose, { Schema, Types } from 'mongoose';
import { PaymentFrequency, RecurringPaymentCategory } from '../../constants/payment';
import { PaymentOutcome } from '../../constants/payment/paymentOutcome';
import { PaymentType } from '../../constants/payment/paymentType';
import { nextOccurrence, ukDay } from '../../utils/dates';
import { enumValues } from '../../utils/helpers/enumHelpers';

// One time the payment was paid or skipped: a single date, or every date up to a payday when the
// rest of a cycle was skipped at once
export interface HandledDates {
  outcome: PaymentOutcome;
  dates: Date[];
}

export interface RecurringPayment {
  name: string;
  amount: number;
  account: Types.ObjectId;
  category: RecurringPaymentCategory;
  frequency: PaymentFrequency;
  type: PaymentType;
  firstPaymentDate: Date;
  lastPaymentDate?: Date;
  // The next date still to pay or skip; null once its last payment has passed
  nextDueDate?: Date | null;
  // What's been paid or skipped since the cycle started, oldest first, so the latest can be undone
  handled: HandledDates[];
}

const handledDatesSchema = new Schema<HandledDates>(
  {
    outcome: {
      type: String,
      required: true,
      enum: enumValues(PaymentOutcome)
    },
    dates: {
      type: [Date],
      required: true
    }
  },
  { _id: false }
);

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
  handled: {
    type: [handledDatesSchema],
    default: []
  }
});

// A new payment, or one whose schedule changed, is due on its next date from today with nothing
// paid or skipped, as the old dates no longer apply. Updates go through save() so this runs for
// them too.
recurringPaymentSchema.pre('validate', function () {
  const scheduleChanged =
    this.isNew ||
    this.isModified('firstPaymentDate') ||
    this.isModified('frequency') ||
    this.isModified('lastPaymentDate');
  if (!scheduleChanged) return;

  this.nextDueDate = nextOccurrence(this, ukDay());
  this.set('handled', []);
});

// Used for finding all recurring payments belonging to an account
recurringPaymentSchema.index({ account: 1 });

export const RecurringPayment = mongoose.model<RecurringPayment>('RecurringPayment', recurringPaymentSchema);

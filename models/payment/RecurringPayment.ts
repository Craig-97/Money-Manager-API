import mongoose, { Schema, Types } from 'mongoose';
import { PaymentFrequency, RecurringPaymentCategory } from '../../constants/payment';
import { PaymentOutcome } from '../../constants/payment/paymentOutcome';
import { PaymentType } from '../../constants/payment/paymentType';
import { addDays, nextOccurrence, ukDay } from '../../utils/dates';
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
  // When a policy or contract renews. The payments carry on past it; it's a prompt to check the
  // price. Yearly payments renew with each payment, so they never have one.
  renewalDate?: Date | null;
  // How many days before it renews to show it as coming up: 0 (off), 7, 14 or 30. For a yearly
  // payment it counts back from each payment instead.
  renewalReminderDays: number;
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
  },
  renewalDate: {
    type: Date,
    default: null
  },
  renewalReminderDays: {
    type: Number,
    default: 0
  }
});

// A new payment, or one whose schedule changed, is due on its next date from today with nothing
// paid or skipped, as the old dates no longer apply. Updates go through save() so this runs for
// them too.
recurringPaymentSchema.pre('validate', function () {
  if (this.isNew || this.isModified('firstPaymentDate') || this.isModified('frequency')) {
    this.nextDueDate = nextOccurrence(this, ukDay());
    this.set('handled', []);
    return;
  }
  if (!this.isModified('lastPaymentDate')) return;

  // Only the end moved, so the dates already paid or skipped still stand. Carry on from the date
  // still due, or after the latest one dealt with if it had ended, else from today.
  const latest = this.handled.at(-1)?.dates.at(-1);
  const from = this.nextDueDate ?? (latest ? addDays(latest, 1) : ukDay());
  this.nextDueDate = nextOccurrence(this, from);
});

// Used for finding all recurring payments belonging to an account
recurringPaymentSchema.index({ account: 1 });

export const RecurringPayment = mongoose.model<RecurringPayment>('RecurringPayment', recurringPaymentSchema);

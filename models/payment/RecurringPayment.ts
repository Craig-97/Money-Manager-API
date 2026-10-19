import mongoose, { Schema, Types } from 'mongoose';
import { PaymentFrequency, RecurringPaymentCategory } from '../../constants/payment';
import { PaymentType } from '../../constants/payment/paymentType';
import { addDays, nextOccurrence, ukDay } from '../../utils/dates';
import { enumValues } from '../../utils/helpers/enumHelpers';
import { PaymentRecord } from './PaymentRecord';
import { reminderTimingSchema, USUAL_TIMING, type ReminderTiming } from '../reminder/reminderTiming';

// A loan or card being paid off by this payment. The balance is what's left to pay, kept up to
// date as payments are marked paid and corrected from a statement.
export interface Debt {
  balance: number;
  // What was borrowed, for how much has been paid off; optional as people don't always know it
  startingBalance?: number | null;
  // Yearly interest rate as a percentage, e.g. 24.9
  apr: number;
  // When the balance was last set by hand
  balanceUpdatedAt?: Date | null;
}

export interface RecurringPayment {
  name: string;
  amount: number;
  budget: Types.ObjectId;
  category: RecurringPaymentCategory;
  frequency: PaymentFrequency;
  type: PaymentType;
  firstPaymentDate: Date;
  lastPaymentDate?: Date;
  // The next date still to pay or skip; null once its last payment has passed
  nextDueDate?: Date | null;
  // When a policy or contract renews. The payments carry on past it; it's a prompt to check the
  // price. Yearly payments renew with each payment, so they never have one.
  renewalDate?: Date | null;
  // When the reminder before each due date goes off
  dueReminder: ReminderTiming;
  // When the reminder before it renews goes off. A yearly payment counts back from each payment.
  renewalReminder: ReminderTiming;
  // Set when the payment is paying off a debt; only ever on an expense
  debt?: Debt | null;
  // The account it goes out of, or an income goes into. None means the one pay lands in.
  account?: Types.ObjectId | null;
  // Another of the budget's accounts it moves money into, like a standing order: marking it paid
  // adds the amount there. Only ever on an expense, and never on a debt.
  paysInto?: Types.ObjectId | null;
}

const debtSchema = new Schema<Debt>(
  {
    balance: { type: Number, required: true, min: 0 },
    startingBalance: { type: Number, default: null, min: 0 },
    apr: { type: Number, required: true, min: 0, max: 100 },
    balanceUpdatedAt: { type: Date, default: null }
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
  budget: {
    type: Schema.Types.ObjectId,
    ref: 'Budget',
    required: [true, 'Budget ID required']
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
  renewalDate: {
    type: Date,
    default: null
  },
  dueReminder: {
    type: reminderTimingSchema,
    default: () => ({ ...USUAL_TIMING })
  },
  renewalReminder: {
    type: reminderTimingSchema,
    default: () => ({ ...USUAL_TIMING })
  },
  debt: {
    type: debtSchema,
    default: undefined
  },
  account: { type: Schema.Types.ObjectId, ref: 'Account', default: null },
  paysInto: { type: Schema.Types.ObjectId, ref: 'Account', default: null }
});

/*
 * A new payment, or one whose schedule changed, is due on its next date from today with nothing
 * paid or skipped, as the old dates no longer apply: its open records are closed after saving, and
 * stay as history. Updates go through save() so this runs for them too.
 *
 * When only the end moves, what's been paid or skipped still stands. If the payment had ended, the
 * caller puts its latest dealt-with date in $locals.latestHandled to carry on after it.
 */
recurringPaymentSchema.pre('validate', function () {
  if (this.isNew || this.isModified('firstPaymentDate') || this.isModified('frequency')) {
    this.nextDueDate = nextOccurrence(this, ukDay());
    if (!this.isNew) this.$locals.closeRecords = true;
    return;
  }
  if (!this.isModified('lastPaymentDate')) return;

  const latest = this.$locals.latestHandled as Date | undefined;
  const from = this.nextDueDate ?? (latest ? addDays(latest, 1) : ukDay());
  this.nextDueDate = nextOccurrence(this, from);
});

recurringPaymentSchema.post('save', async function () {
  if (!this.$locals.closeRecords) return;
  this.$locals.closeRecords = false;
  await PaymentRecord.updateMany({ recurringPayment: this._id, open: true }, { $set: { open: false } }).session(
    this.$session() ?? null
  );
});

// Used for finding all recurring payments belonging to a budget
recurringPaymentSchema.index({ budget: 1 });

export const RecurringPayment = mongoose.model<RecurringPayment>('RecurringPayment', recurringPaymentSchema);

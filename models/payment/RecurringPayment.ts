import mongoose, { Schema, Types } from 'mongoose';
import { PaymentFrequency, RecurringPaymentCategory } from '../../constants/payment';
import { PaymentType } from '../../constants/payment/paymentType';
import { addDays, nextOccurrence, ukDay } from '../../utils/dates';
import { enumValues } from '../../utils/helpers/enumHelpers';
import { PaymentRecord } from './PaymentRecord';

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
  account: Types.ObjectId;
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
  // How many days before it renews to show it as coming up: 0 (off), 7, 14 or 30. For a yearly
  // payment it counts back from each payment instead.
  renewalReminderDays: number;
  // Set when the payment is paying off a debt; only ever on an expense
  debt?: Debt | null;
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
  renewalDate: {
    type: Date,
    default: null
  },
  renewalReminderDays: {
    type: Number,
    default: 0
  },
  debt: {
    type: debtSchema,
    default: undefined
  }
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

// Used for finding all recurring payments belonging to an account
recurringPaymentSchema.index({ account: 1 });

export const RecurringPayment = mongoose.model<RecurringPayment>('RecurringPayment', recurringPaymentSchema);

import mongoose, { Schema, Types } from 'mongoose';

// The bank balance lives on the budget's accounts. Budgets saved before them carry a bankBalance
// until npm run migrate:accounts moves it to the account pay lands in.
export interface Budget {
  monthlyIncome?: number;
  user?: Types.ObjectId;
  // The payday the current cycle was started on, so the payday prompt only shows once per payday
  cycleStartedOn?: Date;
  // When reminders go off, unless a payment has its own timing
  reminderSettings: ReminderSettings;
  // The calendar feed: a private address a calendar app checks, with the dates it carries
  calendarFeed: CalendarFeed;
}

export interface ReminderSettings {
  // Days before a payment is due: 0, 1 or 3
  paymentDays: number;
  // Days before a renewal: 7, 14 or 30
  renewalDays: number;
  // Whether payday has a reminder
  payday: boolean;
}

export interface CalendarFeed {
  // The secret in the feed's address; null while the feed is off
  token?: string | null;
  // What it carries
  payments: boolean;
  paydays: boolean;
  renewals: boolean;
  notes: boolean;
  debtFree: boolean;
  // Amounts in event titles; off by default, as anyone with the address can read it
  showAmounts: boolean;
}

const reminderSettingsSchema = new Schema<ReminderSettings>(
  {
    paymentDays: { type: Number, default: 1 },
    renewalDays: { type: Number, default: 30 },
    payday: { type: Boolean, default: true }
  },
  { _id: false }
);

const calendarFeedSchema = new Schema<CalendarFeed>(
  {
    token: { type: String, default: null },
    payments: { type: Boolean, default: true },
    paydays: { type: Boolean, default: true },
    renewals: { type: Boolean, default: true },
    notes: { type: Boolean, default: true },
    debtFree: { type: Boolean, default: false },
    showAmounts: { type: Boolean, default: false }
  },
  { _id: false }
);

// First define the schema
const BudgetSchema = new Schema<Budget>({
  monthlyIncome: Number,
  user: { type: Schema.Types.ObjectId, ref: 'User' },
  cycleStartedOn: Date,
  reminderSettings: { type: reminderSettingsSchema, default: () => ({}) },
  calendarFeed: { type: calendarFeedSchema, default: () => ({}) }
});

// Used for ensuring one budget per user and quick user->budget lookups
BudgetSchema.index({ user: 1 }, { unique: true });

// For finding the budget a calendar feed's address belongs to; only feeds that are on have one
BudgetSchema.index(
  { 'calendarFeed.token': 1 },
  { unique: true, partialFilterExpression: { 'calendarFeed.token': { $type: 'string' } } }
);

// What's on a budget is found through each record's own budget field, so there's only one link
// to keep right. These fill in when populated, e.g. .populate('notes').
const onBudget = (ref: string, justOne = false) => ({
  ref,
  localField: '_id',
  foreignField: 'budget',
  justOne
});

BudgetSchema.virtual('notes', onBudget('Note'));
BudgetSchema.virtual('oneOffPayments', onBudget('OneOffPayment'));
BudgetSchema.virtual('recurringPayments', onBudget('RecurringPayment'));
BudgetSchema.virtual('payday', onBudget('Payday', true));

// Create and export the model using the schema
export const Budget = mongoose.model<Budget>('Budget', BudgetSchema);

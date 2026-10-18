import mongoose, { Schema, Types } from 'mongoose';

/*
 * What the user did with one reminder. The reminders themselves are worked out from the payments,
 * notes and payday each time they're needed; only this is kept, so it follows the user between
 * devices. The key names the reminder and the date it's for, e.g. "due:<payment id>:2026-10-09", so
 * the next time round is a new reminder.
 */
export interface ReminderState {
  account: Types.ObjectId;
  key: string;
  // Seen, so it no longer counts towards the bell's number
  read: boolean;
  // Put away for good
  cleared: boolean;
  // Put away until this day (midnight UTC), when it goes off again
  snoozedUntil?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

const reminderStateSchema = new Schema<ReminderState>(
  {
    account: { type: Schema.Types.ObjectId, ref: 'Account', required: true },
    key: { type: String, required: true },
    read: { type: Boolean, default: false },
    cleared: { type: Boolean, default: false },
    snoozedUntil: { type: Date, default: null }
  },
  { timestamps: true }
);

// One state per reminder, found by its account
reminderStateSchema.index({ account: 1, key: 1 }, { unique: true });

export const ReminderState = mongoose.model<ReminderState>('ReminderState', reminderStateSchema);

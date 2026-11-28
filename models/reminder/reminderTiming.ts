import { Schema } from 'mongoose';

// When one payment's reminder goes off: never, a set number of days before, or (days left unset)
// whenever the budget's usual timing says
export interface ReminderTiming {
  off: boolean;
  days?: number | null;
}

export const reminderTimingSchema = new Schema<ReminderTiming>(
  {
    off: { type: Boolean, default: false },
    days: { type: Number, default: null, min: 0 }
  },
  { _id: false }
);

// Following the usual timing
export const USUAL_TIMING: ReminderTiming = { off: false, days: null };

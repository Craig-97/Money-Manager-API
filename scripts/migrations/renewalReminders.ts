import mongoose from 'mongoose';

/*
 * Recurring payments used to keep one renewal reminder as renewalReminderDays: 0 (off), 7, 14 or
 * 30. They now have a reminder timing for when each payment is due and one for renewing, either of
 * which can follow the budget's usual timing.
 *
 * - 7, 14 or 30 days keep their days.
 * - 0 on a payment with a renewal date was turned off by hand, so it stays off.
 * - Any other 0 had nothing to remind about (no renewal date) or was a yearly payment left at
 *   the default, so it follows the usual timing.
 *
 * Only payments that still carry renewalReminderDays are changed, so running it again does
 * nothing.
 */

const USUAL = { off: false, days: null };

export interface RenewalRemindersResult {
  found: number;
  // How many keep their days, stay off and follow the usual timing
  kept: number;
  off: number;
  usual: number;
  changed: number;
}

interface StoredPayment {
  _id: mongoose.Types.ObjectId;
  frequency?: string;
  renewalDate?: Date | null;
  renewalReminderDays?: number;
}

const timingFor = (payment: StoredPayment) => {
  const days = payment.renewalReminderDays ?? 0;
  if ([7, 14, 30].includes(days)) return { kind: 'kept' as const, timing: { off: false, days } };
  if (payment.renewalDate && payment.frequency !== 'ANNUALLY') {
    return { kind: 'off' as const, timing: { off: true, days: null } };
  }
  return { kind: 'usual' as const, timing: USUAL };
};

export const migrateRenewalReminders = async ({ apply }: { apply: boolean }) => {
  const payments = mongoose.connection.collection<StoredPayment>('recurringpayments');
  const found = await payments.find({ renewalReminderDays: { $exists: true } }).toArray();

  const result: RenewalRemindersResult = { found: found.length, kept: 0, off: 0, usual: 0, changed: 0 };
  const writes = found.map(payment => {
    const { kind, timing } = timingFor(payment);
    result[kind] += 1;
    return {
      updateOne: {
        filter: { _id: payment._id },
        update: {
          $set: {
            renewalReminder: timing,
            // Left alone if a payment somehow has one already
            ...('dueReminder' in payment ? {} : { dueReminder: USUAL })
          },
          $unset: { renewalReminderDays: '' as const }
        }
      }
    };
  });

  if (apply && writes.length) {
    result.changed = (await payments.bulkWrite(writes)).modifiedCount;
  }
  return result;
};

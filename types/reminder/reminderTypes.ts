import type { ReminderAction } from '../../constants/reminder';

export interface UpdateReminderSettingsInput {
  accountId: string;
  paymentDays?: number | null;
  renewalDays?: number | null;
  payday?: boolean | null;
}

export interface UpdateRemindersInput {
  accountId: string;
  keys: string[];
  action: ReminderAction;
  // YYYY-MM-DD, for LATER
  until?: string | null;
}

export interface UpdateCalendarFeedInput {
  accountId: string;
  enabled?: boolean | null;
  payments?: boolean | null;
  paydays?: boolean | null;
  renewals?: boolean | null;
  notes?: boolean | null;
  debtFree?: boolean | null;
  showAmounts?: boolean | null;
}

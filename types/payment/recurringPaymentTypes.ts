import type { PaymentType } from '../../constants/payment/paymentType';
import type { PaymentFrequency, RecurringPaymentCategory } from '../../constants/payment';

// Days left out (null) follow the account's usual timing
export interface ReminderTimingInput {
  off: boolean;
  days?: number | null;
}

export interface DebtFields {
  balance: number;
  startingBalance?: number | null;
  apr: number;
}

export interface RecurringPaymentFields {
  name: string;
  amount: number;
  category: RecurringPaymentCategory;
  frequency: PaymentFrequency;
  type: PaymentType;
  firstPaymentDate: string;
  lastPaymentDate?: string | null;
  renewalDate?: string | null;
  dueReminder?: ReminderTimingInput;
  renewalReminder?: ReminderTimingInput;
  // null stops tracking it as a debt
  debt?: DebtFields | null;
}

export interface CreateRecurringPaymentInput extends RecurringPaymentFields {
  accountId: string;
}

export type UpdateRecurringPaymentInput = Partial<RecurringPaymentFields>;

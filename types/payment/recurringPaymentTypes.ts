import type { PaymentType } from '../../constants/payment/paymentType';
import type { PaymentFrequency, PaymentCategory } from '../../constants/payment';

// Days left out (null) follow the budget's usual timing
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
  category: PaymentCategory;
  frequency: PaymentFrequency;
  type: PaymentType;
  firstPaymentDate: string;
  lastPaymentDate?: string | null;
  renewalDate?: string | null;
  dueReminder?: ReminderTimingInput;
  renewalReminder?: ReminderTimingInput;
  // null stops tracking it as a debt
  debt?: DebtFields | null;
  // A savings account it pays into; null stops it
  account?: string | null;
  paysInto?: string | null;
}

export interface CreateRecurringPaymentInput extends RecurringPaymentFields {
  budgetId: string;
}

export type UpdateRecurringPaymentInput = Partial<RecurringPaymentFields>;

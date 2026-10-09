import type { PaymentType } from '../../constants/payment/paymentType';
import type { PaymentFrequency, RecurringPaymentCategory } from '../../constants/payment';

export interface RecurringPaymentFields {
  name: string;
  amount: number;
  category: RecurringPaymentCategory;
  frequency: PaymentFrequency;
  type: PaymentType;
  firstPaymentDate: string;
  lastPaymentDate?: string | null;
  renewalDate?: string | null;
  renewalReminderDays?: number;
}

export interface CreateRecurringPaymentInput extends RecurringPaymentFields {
  accountId: string;
}

export type UpdateRecurringPaymentInput = Partial<RecurringPaymentFields>;

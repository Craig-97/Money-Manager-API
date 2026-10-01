import type { PaymentType } from '../constants/paymentType';
import type { PaymentFrequency, RecurringPaymentCategory } from '../models/RecurringPayment';

export interface RecurringPaymentFields {
  name: string;
  amount: number;
  category: RecurringPaymentCategory;
  frequency: PaymentFrequency;
  type: PaymentType;
  firstPaymentDate: string;
  lastPaymentDate?: string;
}

export interface CreateRecurringPaymentInput extends RecurringPaymentFields {
  accountId: string;
}

export type UpdateRecurringPaymentInput = Partial<RecurringPaymentFields>;

export type BatchUpdateRecurringPaymentInput = UpdateRecurringPaymentInput & { id: string };

import type { PaymentStatus } from '../constants/paymentStatus';
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

export type UpdateRecurringPaymentInput = Partial<RecurringPaymentFields> & {
  status?: PaymentStatus;
};

export type BatchUpdateRecurringPaymentInput = UpdateRecurringPaymentInput & { id: string };

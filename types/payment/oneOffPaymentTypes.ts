import type { PaymentType } from '../../constants/payment/paymentType';
import type { PaymentCategory } from '../../constants/payment';
import type { ReminderTimingInput } from './recurringPaymentTypes';

export interface OneOffPaymentFields {
  name: string;
  amount: number;
  dueDate: string;
  type: PaymentType;
  category: PaymentCategory;
  dueReminder?: ReminderTimingInput;
  account?: string | null;
}

export interface CreateOneOffPaymentInput extends OneOffPaymentFields {
  budgetId: string;
}

export type UpdateOneOffPaymentInput = Partial<OneOffPaymentFields>;

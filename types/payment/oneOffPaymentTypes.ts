import type { PaymentType } from '../../constants/payment/paymentType';
import type { OneOffPaymentCategory } from '../../constants/payment';
import type { ReminderTimingInput } from './recurringPaymentTypes';

export interface OneOffPaymentFields {
  name: string;
  amount: number;
  dueDate: string;
  type: PaymentType;
  category: OneOffPaymentCategory;
  dueReminder?: ReminderTimingInput;
}

export interface CreateOneOffPaymentInput extends OneOffPaymentFields {
  accountId: string;
}

export type UpdateOneOffPaymentInput = Partial<OneOffPaymentFields>;

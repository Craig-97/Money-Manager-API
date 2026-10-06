import type { PaymentType } from '../../constants/payment/paymentType';
import type { OneOffPaymentCategory } from '../../constants/payment';

export interface OneOffPaymentFields {
  name: string;
  amount: number;
  dueDate: string;
  type: PaymentType;
  category: OneOffPaymentCategory;
}

export interface CreateOneOffPaymentInput extends OneOffPaymentFields {
  accountId: string;
}

export type UpdateOneOffPaymentInput = Partial<OneOffPaymentFields>;

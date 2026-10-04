import type { PaymentType } from '../constants/paymentType';
import type { OneOffPaymentCategory } from '../models/OneOffPayment';

export interface OneOffPaymentInput {
  account?: string;
  name?: string;
  amount?: number;
  dueDate?: string;
  type?: PaymentType;
  category?: OneOffPaymentCategory;
  paid?: boolean;
}

// Create mutations rely on these fields being present even though the schema marks them optional
export type CreateOneOffPaymentInput = OneOffPaymentInput & {
  account: string;
  name: string;
  type: PaymentType;
};

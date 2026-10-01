import type { BillInput } from './bill';
import type { OneOffPaymentInput } from './oneOffPayment';
import type { PaydayInput } from './payday';
import type { RecurringPaymentFields } from './recurringPayment';

export interface CreateAccountInput {
  bankBalance: number;
  monthlyIncome: number;
  bills?: (BillInput & { name: string })[];
  oneOffPayments?: (OneOffPaymentInput & { name: string })[];
  recurringPayments?: RecurringPaymentFields[];
  payday?: PaydayInput;
  userId: string;
}

export interface EditAccountInput {
  bankBalance?: number;
  monthlyIncome?: number;
}

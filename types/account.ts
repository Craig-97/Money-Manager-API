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

export interface MarkPaymentsPaidInput {
  accountId: string;
  recurringPaymentIds: string[];
  oneOffPaymentIds: string[];
}

export interface MarkPaymentsUnpaidInput {
  accountId: string;
  recurringPaymentIds: string[];
}

export interface StartPaydayCycleInput {
  accountId: string;
  payday: string;
  bankBalance: number;
  recurringPaymentIds: string[];
}

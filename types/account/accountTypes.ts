import type { OneOffPaymentFields } from '../payment/oneOffPaymentTypes';
import type { PaydayInput } from '../payday/paydayTypes';
import type { RecurringPaymentFields } from '../payment/recurringPaymentTypes';

export interface CreateAccountInput {
  bankBalance: number;
  monthlyIncome: number;
  oneOffPayments?: OneOffPaymentFields[];
  recurringPayments?: RecurringPaymentFields[];
  payday?: PaydayInput;
}

export interface UpdateAccountInput {
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
  oneOffPaymentIds?: string[] | null;
}

export interface UndoDebtOverpaymentInput {
  accountId: string;
  recordId: string;
}

export interface SkipRecurringPaymentsInput {
  accountId: string;
  recurringPaymentIds: string[];
  until?: string | null;
}

export interface LogDebtOverpaymentInput {
  accountId: string;
  recurringPaymentId: string;
  amount: number;
}

export interface StartPaydayCycleInput {
  accountId: string;
  payday: string;
  bankBalance: number;
  recurringPaymentIds: string[];
}

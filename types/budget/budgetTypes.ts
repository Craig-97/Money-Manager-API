import type { LeftOverOutcome } from '../../constants/payday/leftOverOutcome';
import type { AccountBalanceInput } from '../account/accountTypes';
import type { OneOffPaymentFields } from '../payment/oneOffPaymentTypes';
import type { PaydayInput } from '../payday/paydayTypes';
import type { RecurringPaymentFields } from '../payment/recurringPaymentTypes';

export interface CreateBudgetInput {
  bankBalance: number;
  monthlyIncome: number;
  oneOffPayments?: OneOffPaymentFields[];
  recurringPayments?: RecurringPaymentFields[];
  payday?: PaydayInput;
}

export interface UpdateBudgetInput {
  monthlyIncome?: number;
}

export interface MarkPaymentsPaidInput {
  budgetId: string;
  recurringPaymentIds: string[];
  oneOffPaymentIds: string[];
}

export interface MarkPaymentsUnpaidInput {
  budgetId: string;
  recurringPaymentIds: string[];
  oneOffPaymentIds?: string[] | null;
}

export interface UndoDebtOverpaymentInput {
  budgetId: string;
  recordId: string;
}

export interface SkipRecurringPaymentsInput {
  budgetId: string;
  recurringPaymentIds: string[];
  until?: string | null;
}

export interface LogDebtOverpaymentInput {
  budgetId: string;
  recurringPaymentId: string;
  amount: number;
}

export interface StartPaydayCycleInput {
  budgetId: string;
  payday: string;
  paidIntoBalance: number;
  accountBalances?: AccountBalanceInput[] | null;
  leftOver: { recurringPaymentId: string; outcome: LeftOverOutcome }[];
  alreadyPaid?: { recurringPaymentIds: string[]; oneOffPaymentIds: string[] } | null;
}

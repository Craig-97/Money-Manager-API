import type { AccountKind } from '../../constants/account/accountKind';
import type { InterestFrequency } from '../../constants/account/interestFrequency';

export interface AccountInterestInput {
  rate: number;
  frequency?: InterestFrequency | null;
  day?: number | null;
  nextDate?: string | null;
}

export interface ConfirmInterestInput {
  accountId: string;
  // None: no interest this time
  amount?: number | null;
}

export interface AccountBalanceInput {
  accountId: string;
  balance: number;
}

export interface CreateAccountInput {
  budgetId: string;
  name: string;
  kind?: AccountKind | null;
  balance: number;
  counts?: boolean | null;
  // Only ever true: pay lands here instead of the account it did
  paidInto?: boolean | null;
  interest?: AccountInterestInput | null;
  purpose?: string | null;
}

export interface UpdateAccountInput {
  name?: string;
  kind?: AccountKind;
  balance?: number;
  counts?: boolean;
  // Only ever true: pay moves here from the account it landed in
  paidInto?: boolean;
  interest?: AccountInterestInput | null;
  purpose?: string | null;
}

export interface UpdateAccountBalancesInput {
  budgetId: string;
  balances: AccountBalanceInput[];
}

export interface PaymentAccountInput {
  recurringPaymentId: string;
  // None goes back to the account pay lands in
  accountId?: string | null;
}

export interface AssignPaymentAccountsInput {
  budgetId: string;
  payments: PaymentAccountInput[];
}

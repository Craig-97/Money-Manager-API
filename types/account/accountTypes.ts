import type { AccountKind } from '../../constants/account/accountKind';

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
  interestRate?: number | null;
  purpose?: string | null;
}

export interface UpdateAccountInput {
  name?: string;
  kind?: AccountKind;
  balance?: number;
  counts?: boolean;
  // Only ever true: pay moves here from the account it landed in
  paidInto?: boolean;
  interestRate?: number | null;
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

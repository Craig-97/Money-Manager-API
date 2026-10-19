export interface AccountBalanceInput {
  accountId: string;
  balance: number;
}

export interface CreateAccountInput {
  budgetId: string;
  name: string;
  balance: number;
  counts?: boolean | null;
  interestRate?: number | null;
  purpose?: string | null;
}

export interface UpdateAccountInput {
  name?: string;
  balance?: number;
  counts?: boolean;
  interestRate?: number | null;
  purpose?: string | null;
}

export interface UpdateAccountBalancesInput {
  budgetId: string;
  balances: AccountBalanceInput[];
}

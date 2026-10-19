import { AccountKind } from '../../constants/account/accountKind';
import { gqlEnum } from '../../utils/helpers/enumHelpers';

export const accountTypeDefs = `
  ${gqlEnum('AccountKind', AccountKind)}

  # A bank account in a budget: its current account, or savings. Balances are typed in, never
  # linked to a bank.
  type Account {
    id: ID!
    name: String!
    # One CURRENT account per budget, where pay lands; the rest are SAVINGS
    kind: AccountKind!
    balance: Float!
    # Part of free to spend. The current account always counts; savings only when switched on.
    counts: Boolean!
    # Shown only, never added to the balance
    interestRate: Float
    # What it's for, e.g. "Holiday fund"
    purpose: String
    # When the balance was last typed in
    balanceUpdatedAt: String!
  }

  # A new savings account. counts is off unless given.
  input CreateAccountInput {
    budgetId: ID!
    name: String!
    balance: Float!
    counts: Boolean
    interestRate: Float
    purpose: String
  }

  # Only what's given changes. A balance that's given is dated now.
  input UpdateAccountInput {
    name: String
    balance: Float
    counts: Boolean
    interestRate: Float
    purpose: String
  }

  input AccountBalanceInput {
    accountId: ID!
    balance: Float!
  }

  input UpdateAccountBalancesInput {
    budgetId: ID!
    balances: [AccountBalanceInput!]!
  }

  # The account, and its budget for the bank balance it makes up
  type AccountResponse {
    account: Account
    budget: Budget
    success: Boolean!
  }

  type Mutation {
    createAccount(input: CreateAccountInput!): AccountResponse!
    updateAccount(id: ID!, input: UpdateAccountInput!): AccountResponse!
    # A savings account only. Payments that paid into it carry on as plain expenses.
    deleteAccount(id: ID!): AccountResponse!
    # Balances typed in together, e.g. the dashboard's bank balance across several accounts
    updateAccountBalances(input: UpdateAccountBalancesInput!): BudgetResponse!
  }
`;

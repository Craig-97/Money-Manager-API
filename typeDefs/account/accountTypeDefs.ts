import { AccountKind } from '../../constants/account/accountKind';
import { gqlEnum } from '../../utils/helpers/enumHelpers';

export const accountTypeDefs = `
  ${gqlEnum('AccountKind', AccountKind)}

  # A bank account in a budget: one to spend from, or savings. Balances are typed in, never linked
  # to a bank.
  type Account {
    id: ID!
    name: String!
    kind: AccountKind!
    balance: Float!
    # Part of free to spend. A spending account always counts; savings only when switched on.
    counts: Boolean!
    # Where pay lands: one spending account per budget. Payments that don't name an account use it.
    paidInto: Boolean!
    # Shown only, never added to the balance
    interestRate: Float
    # What it's for, e.g. "Holiday fund"
    purpose: String
    # When the balance was last typed in
    balanceUpdatedAt: String!
  }

  # A new account, SAVINGS unless kind is given. Savings are kept out of free to spend unless
  # counts is given; a spending account always counts.
  input CreateAccountInput {
    budgetId: ID!
    name: String!
    kind: AccountKind
    balance: Float!
    counts: Boolean
    interestRate: Float
    purpose: String
  }

  # Only what's given changes. A balance that's given is dated now. paidInto can only be true: it
  # moves where pay lands to this account.
  input UpdateAccountInput {
    name: String
    kind: AccountKind
    balance: Float
    counts: Boolean
    paidInto: Boolean
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

  input PaymentAccountInput {
    recurringPaymentId: ID!
    # None goes back to the account pay lands in
    accountId: ID
  }

  input AssignPaymentAccountsInput {
    budgetId: ID!
    payments: [PaymentAccountInput!]!
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
    # Never the account pay lands in. Payments that used it use that one instead.
    deleteAccount(id: ID!): AccountResponse!
    # Balances typed in together, e.g. the dashboard's bank balance across several accounts
    updateAccountBalances(input: UpdateAccountBalancesInput!): BudgetResponse!
    # Which account each of several recurring payments goes out of or into
    assignPaymentAccounts(input: AssignPaymentAccountsInput!): BudgetResponse!
  }
`;

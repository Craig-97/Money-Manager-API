import { AccountKind } from '../../constants/account/accountKind';
import { InterestFrequency } from '../../constants/account/interestFrequency';
import { gqlEnum } from '../../utils/helpers/enumHelpers';

export const accountTypeDefs = `
  ${gqlEnum('AccountKind', AccountKind)}
  ${gqlEnum('InterestFrequency', InterestFrequency)}

  # A savings account's interest. With a frequency it's worked out each day and each payment is
  # checked before it's added; without one the rate is shown only.
  type AccountInterest {
    # AER, as a percentage
    rate: Float!
    frequency: InterestFrequency
    # The day of the month a monthly payment lands on
    day: Int
    # When it's next paid. None once a fixed-term account has matured.
    nextDate: String
    # Interest built up since it was last paid, unrounded, worked out on each day's closing
    # balance up to the start of accruedTo. The app adds the days since at the balance it has now.
    accrued: Float!
    accruedTo: String
    # Payments the app added since the balance was last typed in, oldest first, to check against
    # the bank
    added: [InterestAdded!]!
  }

  type InterestAdded {
    date: String!
    amount: Float!
    balanceAfter: Float!
  }

  # MONTHLY needs day (1 to 31); the others need nextDate, after today. A monthly payment's
  # nextDate is worked out from its day.
  input AccountInterestInput {
    rate: Float!
    frequency: InterestFrequency
    day: Int
    nextDate: String
  }

  # A bank account in a budget: one to spend from, or savings. Balances are typed in, never linked
  # to a bank.
  type Account {
    id: ID!
    name: String!
    kind: AccountKind!
    balance: Float!
    # Part of free to spend. Where pay lands always counts; other accounts can be switched in or out.
    counts: Boolean!
    # Where pay lands: one spending account per budget. Payments that don't name an account use it.
    paidInto: Boolean!
    # Savings only. None for an account that isn't savings or has no rate.
    interest: AccountInterest
    # What it's for, e.g. "Holiday fund"
    purpose: String
    # When the balance was last typed in
    balanceUpdatedAt: String!
  }

  # A new account, SAVINGS unless kind is given. A spending account counts in free to spend and
  # savings are kept out, unless counts says otherwise. paidInto can only be true, on a spending
  # account: pay lands in it from now on, instead of the account it did, and it always counts.
  input CreateAccountInput {
    budgetId: ID!
    name: String!
    kind: AccountKind
    balance: Float!
    counts: Boolean
    paidInto: Boolean
    interest: AccountInterestInput
    purpose: String
  }

  # Only what's given changes. A balance that's given is dated now. paidInto can only be true: it
  # moves where pay lands to this account, which then always counts.
  input UpdateAccountInput {
    name: String
    kind: AccountKind
    balance: Float
    counts: Boolean
    paidInto: Boolean
    # Null stops it
    interest: AccountInterestInput
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
    # Adds savings interest that's come since the app was last opened, each on its own date. Safe
    # to call more than once: what's been added isn't added again.
    catchUpInterest(budgetId: ID!): BudgetResponse!
    # Which account each of several recurring payments goes out of or into
    assignPaymentAccounts(input: AssignPaymentAccountsInput!): BudgetResponse!
  }
`;

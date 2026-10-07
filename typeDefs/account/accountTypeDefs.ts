export const accountTypeDefs = `
  type Query {
    # One of the signed-in user's accounts; their default account when no id is given
    account(id: ID): Account
  }

  type Account {
    id: ID!
    user: User
    bankBalance: Float!
    monthlyIncome: Float!
    oneOffPayments: [OneOffPayment]
    recurringPayments: [RecurringPayment]
    notes: [Note]
    payday: Payday
    # The payday the current cycle was started on
    cycleStartedOn: String
  }

  # A new account for the signed-in user, with the payments and payday set up alongside it
  input CreateAccountInput {
    bankBalance: Float!
    monthlyIncome: Float!
    oneOffPayments: [OneOffPaymentInput!]
    recurringPayments: [RecurringPaymentInput!]
    payday: PaydayInput
  }

  input UpdateAccountInput {
    bankBalance: Float
    monthlyIncome: Float
  }

  input MarkPaymentsPaidInput {
    accountId: ID!
    # Each has its next date paid, and moves on to the date after
    recurringPaymentIds: [ID!]!
    # Deleted once paid
    oneOffPaymentIds: [ID!]!
  }

  input MarkPaymentsUnpaidInput {
    accountId: ID!
    recurringPaymentIds: [ID!]!
  }

  input SkipRecurringPaymentsInput {
    accountId: ID!
    recurringPaymentIds: [ID!]!
    # Skips every date before this day (YYYY-MM-DD), usually the next payday. Without it, only the
    # next date is skipped.
    until: String
  }

  input StartPaydayCycleInput {
    accountId: ID!
    # The payday being started, as YYYY-MM-DD
    payday: String!
    # The balance the user confirmed
    bankBalance: Float!
    # Recurring payments with dates left over from the last cycle, to move on to their next date
    recurringPaymentIds: [ID!]!
  }

  type AccountResponse {
    account: Account
    success: Boolean!
  }

  type Mutation {
    createAccount(input: CreateAccountInput!): AccountResponse!
    updateAccount(id: ID!, input: UpdateAccountInput!): AccountResponse!
    startPaydayCycle(input: StartPaydayCycleInput!): AccountResponse!
    # Takes the payments off (or adds income to) the bank balance: recurring ones have their next
    # date paid and one-offs are deleted
    markPaymentsPaid(input: MarkPaymentsPaidInput!): AccountResponse!
    # Undoes the latest pay or skip on each recurring payment, bringing its dates back. Paid ones
    # put their amounts back on the balance.
    markPaymentsUnpaid(input: MarkPaymentsUnpaidInput!): AccountResponse!
    # Leaves recurring payments' dates unpaid without touching the balance: the next one, or
    # every one before until
    skipRecurringPayments(input: SkipRecurringPaymentsInput!): AccountResponse!
  }
`;

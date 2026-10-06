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
    # Marked paid until the next cycle starts
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
  }

  input StartPaydayCycleInput {
    accountId: ID!
    # The payday being started, as YYYY-MM-DD
    payday: String!
    # The balance the user confirmed
    bankBalance: Float!
    # Recurring payments to reset to unpaid and move on to their next date
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
    # Takes the payments off (or adds income to) the bank balance: recurring ones are marked paid
    # for this cycle and one-offs are deleted
    markPaymentsPaid(input: MarkPaymentsPaidInput!): AccountResponse!
    # Undoes marking recurring payments paid, putting their amounts back on the balance. Skipped
    # ones go back to unpaid with the balance left alone.
    markPaymentsUnpaid(input: MarkPaymentsUnpaidInput!): AccountResponse!
    # Leaves unpaid recurring payments out of this cycle; they come back on their next date
    skipRecurringPayments(input: SkipRecurringPaymentsInput!): AccountResponse!
  }
`;

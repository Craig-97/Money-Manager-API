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
    # Marked paid; they stay until the next payday, so paying can be undone
    oneOffPaymentIds: [ID!]!
  }

  input MarkPaymentsUnpaidInput {
    accountId: ID!
    # Each has its latest pay or skip this cycle undone
    recurringPaymentIds: [ID!]!
    # Paid this cycle, made unpaid again
    oneOffPaymentIds: [ID!]
  }

  input UndoDebtOverpaymentInput {
    accountId: ID!
    # An overpayment record from this cycle
    recordId: ID!
  }

  input SkipRecurringPaymentsInput {
    accountId: ID!
    recurringPaymentIds: [ID!]!
    # Skips every date before this day (YYYY-MM-DD), usually the next payday. Without it, only the
    # next date is skipped.
    until: String
  }

  input LogDebtOverpaymentInput {
    accountId: ID!
    # The recurring payment tracked as a debt
    recurringPaymentId: ID!
    # Paid on top of the usual payments; no more than is left to pay
    amount: Float!
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
    # date paid and one-offs are marked paid
    markPaymentsPaid(input: MarkPaymentsPaidInput!): AccountResponse!
    # Undoes the latest pay or skip this cycle on each recurring payment, bringing its dates back,
    # and makes paid one-offs unpaid. Whatever paying did to the bank balance and debts is put back.
    markPaymentsUnpaid(input: MarkPaymentsUnpaidInput!): AccountResponse!
    # Leaves recurring payments' dates unpaid without touching the balance: the next one, or
    # every one before until
    skipRecurringPayments(input: SkipRecurringPaymentsInput!): AccountResponse!
    # Pays extra off a debt: it comes off the debt's balance and off the bank balance
    logDebtOverpayment(input: LogDebtOverpaymentInput!): AccountResponse!
    # Takes back an overpayment from this cycle, putting it back on the debt and the bank balance
    undoDebtOverpayment(input: UndoDebtOverpaymentInput!): AccountResponse!
  }
`;

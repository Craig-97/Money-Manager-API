export const typeDefs = `
  type Query {
    accounts: [Account!]!
    account(id: ID): Account
  }

  type Account {
    id: ID!
    user: User
    bankBalance: Float!
    monthlyIncome: Float!
    bills: [Bill]
    oneOffPayments: [OneOffPayment]
    recurringPayments: [RecurringPayment]
    notes: [Note]
    payday: Payday
    # The payday the current cycle was started on
    cycleStartedOn: String
  }

 input CreateAccountInput {
    bankBalance: Float!
    monthlyIncome: Float!
    bills: [BillInput]  
    oneOffPayments: [OneOffPaymentInput]
    recurringPayments: [RecurringPaymentInput]
    payday: PaydayInput
    userId: ID!
  }

  input EditAccountInput {
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
    success: Boolean
  }

  type Mutation {
    createAccount(account: CreateAccountInput!): AccountResponse!
    editAccount(id: ID!, account: EditAccountInput!): AccountResponse!
    deleteAccount(id: ID!): AccountResponse!
    startPaydayCycle(input: StartPaydayCycleInput!): AccountResponse!
    # Takes the payments off (or adds income to) the bank balance: recurring ones are marked paid
    # for this cycle and one-offs are deleted
    markPaymentsPaid(input: MarkPaymentsPaidInput!): AccountResponse!
    # Undoes marking recurring payments paid, putting their amounts back on the balance
    markPaymentsUnpaid(input: MarkPaymentsUnpaidInput!): AccountResponse!
  }
`;

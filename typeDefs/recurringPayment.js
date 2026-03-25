exports.typeDefs = `

  enum PaymentCategory {
    MORTGAGE
    RENT
    UTILITIES
    HOME_MAINTENANCE
    VEHICLE
    TRANSPORT
    LOAN
    CREDIT_CARD
    SAVINGS
    INVESTMENT
    INSURANCE
    HEALTHCARE
    CHILDCARE
    EDUCATION
    SUBSCRIPTION
    MEMBERSHIP
    FOOD
    CHARITY
    BUSINESS
    OTHER
  }

  enum PaymentFrequency {
    WEEKLY
    BIWEEKLY
    MONTHLY
    QUARTERLY
    ANNUALLY
  }

  enum PaymentType {
    INCOME
    EXPENSE
  }

  type RecurringPayment {
    id: ID!
    name: String!
    amount: Float!
    account: Account!
    category: PaymentCategory!
    frequency: PaymentFrequency!
    type: PaymentType!
    firstPaymentDate: String!
    lastPaymentDate: String
  }

  input CreateRecurringPaymentInput {
    name: String!
    amount: Float!
    accountId: ID!
    category: PaymentCategory!
    frequency: PaymentFrequency!
    type: PaymentType!
    firstPaymentDate: String!
    lastPaymentDate: String
  }

  input UpdateRecurringPaymentInput {
    name: String
    amount: Float
    category: PaymentCategory
    frequency: PaymentFrequency
    type: PaymentType
    firstPaymentDate: String
    lastPaymentDate: String
  }

  input BatchUpdateRecurringPaymentInput {
    id: ID!
    name: String
    amount: Float
    category: PaymentCategory
    frequency: PaymentFrequency
    type: PaymentType
    firstPaymentDate: String
    lastPaymentDate: String
  }

  type BatchRecurringPaymentResponse {
    recurringPayments: [RecurringPayment!]!
    success: Boolean!
  }

  type RecurringPaymentResponse {
    recurringPayment: RecurringPayment
    success: Boolean!
  }

  type BatchDeleteResponse {
    success: Boolean!
    deletedCount: Int!
  }

  type Query {
    recurringPayments(accountId: ID!): [RecurringPayment!]!
    recurringPayment(id: ID!): RecurringPayment
  }

  type Mutation {
    createRecurringPayment(input: CreateRecurringPaymentInput!): RecurringPaymentResponse!
    updateRecurringPayment(id: ID!, input: UpdateRecurringPaymentInput!): RecurringPaymentResponse!
    deleteRecurringPayment(id: ID!): RecurringPaymentResponse!
    batchUpdateRecurringPayments(input: [BatchUpdateRecurringPaymentInput!]!): BatchRecurringPaymentResponse!
    batchDeleteRecurringPayments(ids: [ID!]!): BatchDeleteResponse!
  }
`;

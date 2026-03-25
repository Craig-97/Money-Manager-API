exports.typeDefs = `
  enum PaymentType {
    INCOME
    EXPENSE
  }

  enum PaymentCategory {
    TRANSFER
    INVESTMENT
    FEES
    TAXES
    HOME
    UTILITIES
    VEHICLE
    TRAVEL
    TRANSPORT
    FOOD
    SHOPPING
    ENTERTAINMENT
    HEALTHCARE
    EDUCATION
    GIFT
    PETS
    SALARY
    BUSINESS
    CHARITY
    OTHER
  }

  type OneOffPayment {
    id: ID!
    account: ID!
    name: String!
    amount: Float!
    dueDate: String!
    type: PaymentType!
    category: PaymentCategory!
  }

  input OneOffPaymentInput {
    account: ID
    name: String
    amount: Float
    dueDate: String
    type: PaymentType
    category: PaymentCategory
  }

  type OneOffPaymentResponse {
    oneOffPayment: OneOffPayment
    success: Boolean
  }

  type BatchOneOffPaymentResponse {
    oneOffPayments: [OneOffPayment]!
    success: Boolean!
    deletedCount: Int!
  }

  type Query {
    oneOffPayments(accountId: ID!): [OneOffPayment!]!
    oneOffPayment(id: ID): OneOffPayment
  }


  type Mutation {
    createOneOffPayment(oneOffPayment: OneOffPaymentInput!): OneOffPaymentResponse!
    editOneOffPayment(id: ID!, oneOffPayment: OneOffPaymentInput!): OneOffPaymentResponse!
    deleteOneOffPayment(id: ID!): OneOffPaymentResponse!
    batchDeleteOneOffPayments(ids: [ID!]!): BatchOneOffPaymentResponse!
  }
`;

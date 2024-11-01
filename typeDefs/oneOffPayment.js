exports.typeDefs = `
  type Query {
    oneOffPayments: [OneOffPayment!]!
    oneOffPayment(id: ID): OneOffPayment
  }

  type OneOffPayment {
    id: ID!
    account: ID!
    name: String!
    amount: Float!
  }

  input OneOffPaymentInput {
    account: ID
    name: String
    amount: Float
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

  type Mutation {
    createOneOffPayment(oneOffPayment: OneOffPaymentInput!): OneOffPaymentResponse!
    editOneOffPayment(id: ID!, oneOffPayment: OneOffPaymentInput!): OneOffPaymentResponse!
    deleteOneOffPayment(id: ID!): OneOffPaymentResponse!
    batchDeleteOneOffPayments(ids: [ID!]!): BatchOneOffPaymentResponse!
  }
`;

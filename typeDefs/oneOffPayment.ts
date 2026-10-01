import { PaymentType } from '../constants/paymentType';
import { OneOffPaymentCategory } from '../models/OneOffPayment';
import { gqlEnum } from '../utils/helpers/enumHelpers';

export const typeDefs = `
  ${gqlEnum('PaymentType', PaymentType)}

  ${gqlEnum('OneOffPaymentCategory', OneOffPaymentCategory)}

  type OneOffPayment {
    id: ID!
    account: ID!
    name: String!
    amount: Float!
    dueDate: String!
    type: PaymentType!
    category: OneOffPaymentCategory!
  }

  input OneOffPaymentInput {
    account: ID
    name: String
    amount: Float
    dueDate: String
    type: PaymentType
    category: OneOffPaymentCategory
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

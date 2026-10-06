import { PaymentType } from '../../constants/payment/paymentType';
import { OneOffPaymentCategory } from '../../constants/payment';
import { gqlEnum } from '../../utils/helpers/enumHelpers';

export const oneOffPaymentTypeDefs = `
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

  input CreateOneOffPaymentInput {
    accountId: ID!
    name: String!
    amount: Float!
    dueDate: String!
    type: PaymentType!
    category: OneOffPaymentCategory!
  }

  # A one-off payment created alongside its account, so it has no accountId yet
  input OneOffPaymentInput {
    name: String!
    amount: Float!
    dueDate: String!
    type: PaymentType!
    category: OneOffPaymentCategory!
  }

  input UpdateOneOffPaymentInput {
    name: String
    amount: Float
    dueDate: String
    type: PaymentType
    category: OneOffPaymentCategory
  }

  type OneOffPaymentResponse {
    oneOffPayment: OneOffPayment
    success: Boolean!
  }

  type Mutation {
    createOneOffPayment(input: CreateOneOffPaymentInput!): OneOffPaymentResponse!
    updateOneOffPayment(id: ID!, input: UpdateOneOffPaymentInput!): OneOffPaymentResponse!
    batchDeleteOneOffPayments(ids: [ID!]!): DeleteResponse!
  }
`;

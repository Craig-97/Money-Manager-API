import { PaymentType } from '../../constants/payment/paymentType';
import { OneOffPaymentCategory } from '../../constants/payment';
import { gqlEnum } from '../../utils/helpers/enumHelpers';

export const oneOffPaymentTypeDefs = `
  ${gqlEnum('PaymentType', PaymentType)}
  ${gqlEnum('OneOffPaymentCategory', OneOffPaymentCategory)}

  type OneOffPayment {
    id: ID!
    budget: ID!
    name: String!
    amount: Float!
    dueDate: String!
    type: PaymentType!
    category: OneOffPaymentCategory!
    # When it was marked paid. A paid one-off stays until the next payday, so it can be undone with
    # markPaymentsUnpaid; payday clears it away.
    paidAt: String
    # When the reminder before it's due goes off
    dueReminder: ReminderTiming!
  }

  input CreateOneOffPaymentInput {
    budgetId: ID!
    name: String!
    amount: Float!
    dueDate: String!
    type: PaymentType!
    category: OneOffPaymentCategory!
    dueReminder: ReminderTimingInput
  }

  # A one-off payment created alongside its budget, so it has no budgetId yet
  input OneOffPaymentInput {
    name: String!
    amount: Float!
    dueDate: String!
    type: PaymentType!
    category: OneOffPaymentCategory!
    dueReminder: ReminderTimingInput
  }

  input UpdateOneOffPaymentInput {
    name: String
    amount: Float
    dueDate: String
    type: PaymentType
    category: OneOffPaymentCategory
    dueReminder: ReminderTimingInput
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

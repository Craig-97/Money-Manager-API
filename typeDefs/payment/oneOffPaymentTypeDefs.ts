import { PaymentType } from '../../constants/payment/paymentType';
import { PaymentCategory } from '../../constants/payment';
import { gqlEnum } from '../../utils/helpers/enumHelpers';

export const oneOffPaymentTypeDefs = `
  ${gqlEnum('PaymentType', PaymentType)}
  ${gqlEnum('PaymentCategory', PaymentCategory)}

  type OneOffPayment {
    id: ID!
    budget: ID!
    name: String!
    amount: Float!
    dueDate: String!
    type: PaymentType!
    category: PaymentCategory!
    # When it was marked paid. A paid one-off stays until the next payday, so it can be undone with
    # markPaymentsUnpaid; payday clears it away.
    paidAt: String
    # When the reminder before it's due goes off
    dueReminder: ReminderTiming!
    # The account it goes out of, or comes into. Null: the one pay lands in.
    account: ID
  }

  input CreateOneOffPaymentInput {
    budgetId: ID!
    name: String!
    amount: Float!
    dueDate: String!
    type: PaymentType!
    category: PaymentCategory!
    dueReminder: ReminderTimingInput
    # An account in the same budget: a spending one for an expense. Null: the one pay lands in.
    account: ID
  }

  # A one-off payment created alongside its budget, so it has no budgetId yet
  input OneOffPaymentInput {
    name: String!
    amount: Float!
    dueDate: String!
    type: PaymentType!
    category: PaymentCategory!
    dueReminder: ReminderTimingInput
    # An account in the same budget: a spending one for an expense. Null: the one pay lands in.
    account: ID
  }

  input UpdateOneOffPaymentInput {
    name: String
    amount: Float
    dueDate: String
    type: PaymentType
    category: PaymentCategory
    dueReminder: ReminderTimingInput
    # An account in the same budget: a spending one for an expense. Null: the one pay lands in.
    account: ID
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

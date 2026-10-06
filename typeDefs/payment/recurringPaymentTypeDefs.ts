import { PaymentStatus } from '../../constants/payment/paymentStatus';
import { PaymentType } from '../../constants/payment/paymentType';
import { PaymentFrequency, RecurringPaymentCategory } from '../../constants/payment';
import { gqlEnum } from '../../utils/helpers/enumHelpers';

export const recurringPaymentTypeDefs = `
  ${gqlEnum('RecurringPaymentCategory', RecurringPaymentCategory)}
  ${gqlEnum('PaymentFrequency', PaymentFrequency)}
  ${gqlEnum('PaymentType', PaymentType)}
  ${gqlEnum('PaymentStatus', PaymentStatus)}

  type RecurringPayment {
    id: ID!
    account: ID!
    name: String!
    amount: Float!
    category: RecurringPaymentCategory!
    frequency: PaymentFrequency!
    type: PaymentType!
    firstPaymentDate: String!
    lastPaymentDate: String
    # The date it's due this cycle, worked out from the schedule. Null once it has ended.
    nextDueDate: String
    # Changed by markPaymentsPaid, markPaymentsUnpaid and skipRecurringPayments, which keep the
    # bank balance right
    status: PaymentStatus!
  }

  input CreateRecurringPaymentInput {
    accountId: ID!
    name: String!
    amount: Float!
    category: RecurringPaymentCategory!
    frequency: PaymentFrequency!
    type: PaymentType!
    firstPaymentDate: String!
    lastPaymentDate: String
  }

  # A recurring payment created alongside its account, so it has no accountId yet
  input RecurringPaymentInput {
    name: String!
    amount: Float!
    category: RecurringPaymentCategory!
    frequency: PaymentFrequency!
    type: PaymentType!
    firstPaymentDate: String!
    lastPaymentDate: String
  }

  input UpdateRecurringPaymentInput {
    name: String
    amount: Float
    category: RecurringPaymentCategory
    frequency: PaymentFrequency
    type: PaymentType
    firstPaymentDate: String
    lastPaymentDate: String
  }

  type RecurringPaymentResponse {
    recurringPayment: RecurringPayment
    success: Boolean!
  }

  type Mutation {
    createRecurringPayment(input: CreateRecurringPaymentInput!): RecurringPaymentResponse!
    updateRecurringPayment(id: ID!, input: UpdateRecurringPaymentInput!): RecurringPaymentResponse!
    batchDeleteRecurringPayments(ids: [ID!]!): DeleteResponse!
  }
`;

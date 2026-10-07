import { PaymentOutcome } from '../../constants/payment/paymentOutcome';
import { PaymentType } from '../../constants/payment/paymentType';
import { PaymentFrequency, RecurringPaymentCategory } from '../../constants/payment';
import { gqlEnum } from '../../utils/helpers/enumHelpers';

export const recurringPaymentTypeDefs = `
  ${gqlEnum('RecurringPaymentCategory', RecurringPaymentCategory)}
  ${gqlEnum('PaymentFrequency', PaymentFrequency)}
  ${gqlEnum('PaymentType', PaymentType)}
  ${gqlEnum('PaymentOutcome', PaymentOutcome)}

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
    # The next date still to pay or skip, worked out from the schedule. Null once it has ended.
    nextDueDate: String
    # What's been paid or skipped since the cycle started, oldest first. Changed by
    # markPaymentsPaid, skipRecurringPayments and markPaymentsUnpaid, which keep the balance right.
    handled: [HandledDates!]!
  }

  # One time a recurring payment was paid or skipped: one date, or the rest of a cycle at once
  type HandledDates {
    outcome: PaymentOutcome!
    dates: [String!]!
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

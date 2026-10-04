import { PaymentStatus } from '../constants/paymentStatus';
import { PaymentType } from '../constants/paymentType';
import { PaymentFrequency, RecurringPaymentCategory } from '../models/RecurringPayment';
import { gqlEnum } from '../utils/helpers/enumHelpers';

export const typeDefs = `

  ${gqlEnum('RecurringPaymentCategory', RecurringPaymentCategory)}

  ${gqlEnum('PaymentFrequency', PaymentFrequency)}

  ${gqlEnum('PaymentType', PaymentType)}

  ${gqlEnum('PaymentStatus', PaymentStatus)}

  type RecurringPayment {
    id: ID!
    name: String!
    amount: Float!
    account: Account!
    category: RecurringPaymentCategory!
    frequency: PaymentFrequency!
    type: PaymentType!
    firstPaymentDate: String!
    lastPaymentDate: String
    # The date it's due this cycle, worked out from the schedule. Null once it has ended.
    nextDueDate: String
    status: PaymentStatus!
  }

  input CreateRecurringPaymentInput {
    name: String!
    amount: Float!
    accountId: ID!
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
    status: PaymentStatus
  }

  input BatchUpdateRecurringPaymentInput {
    id: ID!
    name: String
    amount: Float
    category: RecurringPaymentCategory
    frequency: PaymentFrequency
    type: PaymentType
    firstPaymentDate: String
    lastPaymentDate: String
    status: PaymentStatus
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

import { PaymentRecordKind } from '../../constants/payment/paymentRecordKind';
import { PaymentType } from '../../constants/payment/paymentType';
import { PaymentFrequency, RecurringPaymentCategory } from '../../constants/payment';
import { gqlEnum } from '../../utils/helpers/enumHelpers';

export const recurringPaymentTypeDefs = `
  ${gqlEnum('RecurringPaymentCategory', RecurringPaymentCategory)}
  ${gqlEnum('PaymentFrequency', PaymentFrequency)}
  ${gqlEnum('PaymentType', PaymentType)}
  ${gqlEnum('PaymentRecordKind', PaymentRecordKind)}

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
    # Its pays and skips since the cycle started, oldest first: what the dashboard shows as paid or
    # skipped, and what markPaymentsUnpaid takes back (the latest first)
    thisCycle: [PaymentRecord!]!
    # Everything that's happened to it, newest first: pays, skips, overpayments and debt balances
    # set by hand. Records from before the current cycle can't be undone. Up to 200; 50 by default.
    history(limit: Int): [PaymentRecord!]!
    # When a policy or contract renews; the payments carry on past it. Never set on yearly
    # payments, which renew with each payment.
    renewalDate: String
    # When the reminder before each due date goes off
    dueReminder: ReminderTiming!
    # When the reminder before it renews goes off. A yearly payment counts back from each payment.
    renewalReminder: ReminderTiming!
    # Set when it's paying off a loan or card; only ever on an expense
    debt: Debt
  }

  # A loan or card a recurring payment pays off. Marking a payment paid takes the period's interest
  # (estimated from the APR) onto the balance, then the payment off it.
  type Debt {
    # What's left to pay
    balance: Float!
    # What was borrowed, if known
    startingBalance: Float
    # Yearly interest rate as a percentage, e.g. 24.9
    apr: Float!
    # When the balance was last set by hand, e.g. from a statement
    balanceUpdatedAt: String
    # How much less it owes since payday, from payments marked paid and overpayments
    paidOffThisCycle: Float!
  }

  # Tracks a payment as a debt. On an update, null stops tracking it.
  input DebtInput {
    balance: Float!
    startingBalance: Float
    apr: Float!
  }

  # Something that happened to a payment
  type PaymentRecord {
    id: ID!
    kind: PaymentRecordKind!
    # The due dates it covers; the day it happened for an overpayment or a balance change
    dates: [String!]!
    # What it did to the bank balance: negative for money out
    balanceChange: Float!
    # What it did to a debt, when the payment is one
    debt: PaymentRecordDebt
    # Still in the current cycle, so it can be undone: the latest pay or skip with
    # markPaymentsUnpaid, an overpayment with undoDebtOverpayment
    open: Boolean!
    createdAt: String!
  }

  type PaymentRecordDebt {
    # Interest added for the period, estimated from the APR
    interest: Float!
    # How much less is owed afterwards; negative when it went up
    reduction: Float!
    balanceAfter: Float!
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
    renewalDate: String
    dueReminder: ReminderTimingInput
    renewalReminder: ReminderTimingInput
    debt: DebtInput
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
    renewalDate: String
    dueReminder: ReminderTimingInput
    renewalReminder: ReminderTimingInput
    debt: DebtInput
  }

  input UpdateRecurringPaymentInput {
    name: String
    amount: Float
    category: RecurringPaymentCategory
    frequency: PaymentFrequency
    type: PaymentType
    firstPaymentDate: String
    lastPaymentDate: String
    renewalDate: String
    dueReminder: ReminderTimingInput
    renewalReminder: ReminderTimingInput
    debt: DebtInput
  }

  type RecurringPaymentResponse {
    recurringPayment: RecurringPayment
    success: Boolean!
  }

  type Query {
    # One of the signed-in user's recurring payments, e.g. to read a debt's history
    recurringPayment(id: ID!): RecurringPayment
  }

  type Mutation {
    createRecurringPayment(input: CreateRecurringPaymentInput!): RecurringPaymentResponse!
    updateRecurringPayment(id: ID!, input: UpdateRecurringPaymentInput!): RecurringPaymentResponse!
    batchDeleteRecurringPayments(ids: [ID!]!): DeleteResponse!
  }
`;

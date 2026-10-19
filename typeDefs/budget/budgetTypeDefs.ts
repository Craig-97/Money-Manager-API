import { LeftOverOutcome } from '../../constants/payday/leftOverOutcome';
import { gqlEnum } from '../../utils/helpers/enumHelpers';

export const budgetTypeDefs = `
  ${gqlEnum('LeftOverOutcome', LeftOverOutcome)}

  type Query {
    # One of the signed-in user's budgets; their default budget when no id is given
    budget(id: ID): Budget
  }

  type Budget {
    id: ID!
    user: User
    bankBalance: Float!
    monthlyIncome: Float!
    oneOffPayments: [OneOffPayment]
    recurringPayments: [RecurringPayment]
    notes: [Note]
    payday: Payday
    # The payday the current cycle was started on
    cycleStartedOn: String
  }

  # A new budget for the signed-in user, with the payments and payday set up alongside it
  input CreateBudgetInput {
    bankBalance: Float!
    monthlyIncome: Float!
    oneOffPayments: [OneOffPaymentInput!]
    recurringPayments: [RecurringPaymentInput!]
    payday: PaydayInput
  }

  input UpdateBudgetInput {
    bankBalance: Float
    monthlyIncome: Float
  }

  input MarkPaymentsPaidInput {
    budgetId: ID!
    # Each has its next date paid, and moves on to the date after
    recurringPaymentIds: [ID!]!
    # Marked paid; they stay until the next payday, so paying can be undone
    oneOffPaymentIds: [ID!]!
  }

  input MarkPaymentsUnpaidInput {
    budgetId: ID!
    # Each has its latest pay or skip this cycle undone
    recurringPaymentIds: [ID!]!
    # Paid this cycle, made unpaid again
    oneOffPaymentIds: [ID!]
  }

  input UndoDebtOverpaymentInput {
    budgetId: ID!
    # An overpayment record from this cycle
    recordId: ID!
  }

  input SkipRecurringPaymentsInput {
    budgetId: ID!
    recurringPaymentIds: [ID!]!
    # Skips every date before this day (YYYY-MM-DD), usually the next payday. Without it, only the
    # next date is skipped.
    until: String
  }

  input LogDebtOverpaymentInput {
    budgetId: ID!
    # The recurring payment tracked as a debt
    recurringPaymentId: ID!
    # Paid on top of the usual payments; no more than is left to pay
    amount: Float!
  }

  # A recurring payment with dates left over from the last cycle, and what happened to them
  input LeftOverPaymentInput {
    recurringPaymentId: ID!
    outcome: LeftOverOutcome!
  }

  # Payments due from payday to today that have already gone out
  input AlreadyPaidInput {
    recurringPaymentIds: [ID!]!
    oneOffPaymentIds: [ID!]!
  }

  input StartPaydayCycleInput {
    budgetId: ID!
    # The payday being started, as YYYY-MM-DD
    payday: String!
    # The balance the user confirmed
    bankBalance: Float!
    # PAID and SKIPPED are recorded and move the payment on; DUE leaves it overdue. One that isn't
    # listed stays due too.
    leftOver: [LeftOverPaymentInput!]!
    # Recorded as paid in the new cycle without changing the confirmed balance, which allows for them
    alreadyPaid: AlreadyPaidInput
  }

  type BudgetResponse {
    budget: Budget
    success: Boolean!
  }

  type Mutation {
    createBudget(input: CreateBudgetInput!): BudgetResponse!
    updateBudget(id: ID!, input: UpdateBudgetInput!): BudgetResponse!
    startPaydayCycle(input: StartPaydayCycleInput!): BudgetResponse!
    # Takes the payments off (or adds income to) the bank balance: recurring ones have their next
    # date paid and one-offs are marked paid
    markPaymentsPaid(input: MarkPaymentsPaidInput!): BudgetResponse!
    # Undoes the latest pay or skip this cycle on each recurring payment, bringing its dates back,
    # and makes paid one-offs unpaid. Whatever paying did to the bank balance and debts is put back.
    markPaymentsUnpaid(input: MarkPaymentsUnpaidInput!): BudgetResponse!
    # Leaves recurring payments' dates unpaid without touching the balance: the next one, or
    # every one before until
    skipRecurringPayments(input: SkipRecurringPaymentsInput!): BudgetResponse!
    # Pays extra off a debt: it comes off the debt's balance and off the bank balance
    logDebtOverpayment(input: LogDebtOverpaymentInput!): BudgetResponse!
    # Takes back an overpayment from this cycle, putting it back on the debt and the bank balance
    undoDebtOverpayment(input: UndoDebtOverpaymentInput!): BudgetResponse!
  }
`;

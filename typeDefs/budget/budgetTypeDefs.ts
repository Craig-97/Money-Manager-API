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
    # The bank balance on the dashboard: the accounts that count in free to spend, added up
    bankBalance: Float!
    # Where pay lands first, then the other spending accounts, then savings, each oldest first
    accounts: [Account!]!
    monthlyIncome: Float!
    oneOffPayments: [OneOffPayment]
    recurringPayments: [RecurringPayment]
    notes: [Note]
    payday: Payday
    # The payday the current cycle was started on
    cycleStartedOn: String
  }

  # An account made with the budget. Payments set up alongside it name it by its key.
  input BudgetAccountInput {
    key: String!
    name: String!
    kind: AccountKind
    balance: Float!
    counts: Boolean
    interestRate: Float
    purpose: String
  }

  # A new budget for the signed-in user, with its accounts, payments and payday set up alongside
  # it. In its payments, account and paysInto are account keys, "paid-into" being the account pay
  # lands in.
  input CreateBudgetInput {
    # The opening balance of the account pay lands in, which is made with the budget
    bankBalance: Float!
    # Its name; "Current account" when left out
    paidIntoName: String
    # The budget's other accounts
    accounts: [BudgetAccountInput!]
    monthlyIncome: Float!
    oneOffPayments: [OneOffPaymentInput!]
    recurringPayments: [RecurringPaymentInput!]
    payday: PaydayInput
  }

  # Balances are set on the accounts, with updateAccount
  input UpdateBudgetInput {
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
    # The balance of the account pay lands in, as the user confirmed it
    paidIntoBalance: Float!
    # Savings balances the user checked at the same time
    accountBalances: [AccountBalanceInput!]
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

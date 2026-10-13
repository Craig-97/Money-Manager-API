// What a payment record says happened
export const PaymentRecordKind = {
  // A due date paid, from the dashboard or payday prompt
  PAID: 'PAID',
  // One or more due dates left unpaid without touching the balance
  SKIPPED: 'SKIPPED',
  // Extra paid off a debt on top of its usual payments
  OVERPAYMENT: 'OVERPAYMENT',
  // A debt's balance set by hand, e.g. from a statement
  BALANCE_SET: 'BALANCE_SET'
} as const;

export type PaymentRecordKind = (typeof PaymentRecordKind)[keyof typeof PaymentRecordKind];

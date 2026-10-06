// Where a recurring payment's current due date stands in this pay cycle
export const PaymentStatus = {
  UNPAID: 'UNPAID',
  PAID: 'PAID',
  // Not being paid this cycle; it moves on to its next date when the next cycle starts
  SKIPPED: 'SKIPPED'
} as const;

export type PaymentStatus = (typeof PaymentStatus)[keyof typeof PaymentStatus];

// How often a recurring payment is due
export const PaymentFrequency = {
  WEEKLY: 'WEEKLY',
  BIWEEKLY: 'BIWEEKLY',
  MONTHLY: 'MONTHLY',
  QUARTERLY: 'QUARTERLY',
  ANNUALLY: 'ANNUALLY'
} as const;

export type PaymentFrequency = (typeof PaymentFrequency)[keyof typeof PaymentFrequency];

// Shared by one off and recurring payments
export const PaymentType = {
  INCOME: 'INCOME',
  EXPENSE: 'EXPENSE'
} as const;

export type PaymentType = (typeof PaymentType)[keyof typeof PaymentType];

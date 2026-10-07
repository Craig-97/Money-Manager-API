// How a date a recurring payment fell on was dealt with
export const PaymentOutcome = {
  PAID: 'PAID',
  // Not paid, and not coming off the balance
  SKIPPED: 'SKIPPED'
} as const;

export type PaymentOutcome = (typeof PaymentOutcome)[keyof typeof PaymentOutcome];

// What a recurring payment is for
export const RecurringPaymentCategory = {
  MORTGAGE: 'MORTGAGE',
  RENT: 'RENT',
  UTILITIES: 'UTILITIES',
  HOME_MAINTENANCE: 'HOME_MAINTENANCE',
  TAX: 'TAX',
  VEHICLE: 'VEHICLE',
  TRANSPORT: 'TRANSPORT',
  LOAN: 'LOAN',
  CREDIT_CARD: 'CREDIT_CARD',
  SAVINGS: 'SAVINGS',
  INVESTMENT: 'INVESTMENT',
  INSURANCE: 'INSURANCE',
  HEALTHCARE: 'HEALTHCARE',
  CHILDCARE: 'CHILDCARE',
  EDUCATION: 'EDUCATION',
  SUBSCRIPTION: 'SUBSCRIPTION',
  MEMBERSHIP: 'MEMBERSHIP',
  FOOD: 'FOOD',
  CHARITY: 'CHARITY',
  BUSINESS: 'BUSINESS',
  OTHER: 'OTHER'
} as const;

export type RecurringPaymentCategory =
  (typeof RecurringPaymentCategory)[keyof typeof RecurringPaymentCategory];

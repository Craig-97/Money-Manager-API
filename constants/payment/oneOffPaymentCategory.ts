// What a one-off payment is for
export const OneOffPaymentCategory = {
  TRANSFER: 'TRANSFER',
  INVESTMENT: 'INVESTMENT',
  FEES: 'FEES',
  TAXES: 'TAXES',
  HOME: 'HOME',
  UTILITIES: 'UTILITIES',
  VEHICLE: 'VEHICLE',
  TRAVEL: 'TRAVEL',
  TRANSPORT: 'TRANSPORT',
  FOOD: 'FOOD',
  SHOPPING: 'SHOPPING',
  ENTERTAINMENT: 'ENTERTAINMENT',
  HEALTHCARE: 'HEALTHCARE',
  EDUCATION: 'EDUCATION',
  GIFT: 'GIFT',
  PETS: 'PETS',
  SALARY: 'SALARY',
  BUSINESS: 'BUSINESS',
  CHARITY: 'CHARITY',
  OTHER: 'OTHER'
} as const;

export type OneOffPaymentCategory =
  (typeof OneOffPaymentCategory)[keyof typeof OneOffPaymentCategory];

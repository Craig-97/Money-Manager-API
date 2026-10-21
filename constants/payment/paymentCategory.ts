// What a payment is for, one-off or recurring. Monzo's categories, plus Subscriptions.
export const PaymentCategory = {
  BILLS: 'BILLS',
  CHARITY: 'CHARITY',
  EATING_OUT: 'EATING_OUT',
  ENTERTAINMENT: 'ENTERTAINMENT',
  // Work costs to claim back
  EXPENSES: 'EXPENSES',
  FAMILY: 'FAMILY',
  FINANCES: 'FINANCES',
  GENERAL: 'GENERAL',
  GIFTS: 'GIFTS',
  GROCERIES: 'GROCERIES',
  HOLIDAYS: 'HOLIDAYS',
  INCOME: 'INCOME',
  PERSONAL_CARE: 'PERSONAL_CARE',
  SAVINGS: 'SAVINGS',
  SHOPPING: 'SHOPPING',
  SUBSCRIPTIONS: 'SUBSCRIPTIONS',
  TRANSFERS: 'TRANSFERS',
  TRANSPORT: 'TRANSPORT'
} as const;

export type PaymentCategory = (typeof PaymentCategory)[keyof typeof PaymentCategory];

// How often someone is paid
export const PayFrequency = {
  WEEKLY: 'WEEKLY',
  FORTNIGHTLY: 'FORTNIGHTLY',
  FOUR_WEEKLY: 'FOUR_WEEKLY',
  MONTHLY: 'MONTHLY',
  QUARTERLY: 'QUARTERLY',
  BIANNUAL: 'BIANNUAL',
  ANNUAL: 'ANNUAL'
} as const;

export type PayFrequency = (typeof PayFrequency)[keyof typeof PayFrequency];

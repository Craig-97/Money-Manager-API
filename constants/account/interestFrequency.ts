// How often a savings account pays its interest. It's worked out each day on the balance either way.
export const InterestFrequency = {
  // On a day of the month
  MONTHLY: 'MONTHLY',
  // Every 3 months from a date
  QUARTERLY: 'QUARTERLY',
  // Once a year on a date
  YEARLY: 'YEARLY',
  // Once, when a fixed-term account ends
  MATURITY: 'MATURITY'
} as const;

export type InterestFrequency = (typeof InterestFrequency)[keyof typeof InterestFrequency];

// When a payment that falls on a weekend or bank holiday goes out
export const NonWorkingDay = {
  // The next working day, as most direct debits do
  NEXT: 'NEXT',
  // The working day before
  BEFORE: 'BEFORE',
  // That day anyway, as card payments can
  ON_DAY: 'ON_DAY'
} as const;

export type NonWorkingDay = (typeof NonWorkingDay)[keyof typeof NonWorkingDay];

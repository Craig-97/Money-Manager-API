// Whose bank holidays move a payday earlier
export const BankHolidayRegion = {
  ENGLAND_AND_WALES: 'ENGLAND_AND_WALES',
  SCOTLAND: 'SCOTLAND',
  NORTHERN_IRELAND: 'NORTHERN_IRELAND'
} as const;

export type BankHolidayRegion = (typeof BankHolidayRegion)[keyof typeof BankHolidayRegion];

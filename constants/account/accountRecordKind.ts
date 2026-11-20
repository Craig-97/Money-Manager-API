// What an account record says happened to the balance, besides payments
export const AccountRecordKind = {
  // The balance it had when its history began: when it was added, or when history came in
  OPENING: 'OPENING',
  // A balance the user typed in, e.g. from their bank or at payday
  BALANCE_SET: 'BALANCE_SET',
  // Savings interest the app added on its date
  INTEREST: 'INTEREST'
} as const;

export type AccountRecordKind = (typeof AccountRecordKind)[keyof typeof AccountRecordKind];

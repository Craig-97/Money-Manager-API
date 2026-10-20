// What a bank account is for
export const AccountKind = {
  // Money to spend: payments go out of it, and it always counts in free to spend. One of them is
  // where pay lands.
  SPENDING: 'SPENDING',
  // Money put aside, a cash ISA included. Kept out of free to spend unless switched on.
  SAVINGS: 'SAVINGS'
} as const;

export type AccountKind = (typeof AccountKind)[keyof typeof AccountKind];

// In setup, the key payments use for the account pay lands in, made with the budget
export const PAID_INTO_KEY = 'paid-into';

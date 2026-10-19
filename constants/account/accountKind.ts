// What a bank account is for
export const AccountKind = {
  // Money to spend: payments go out of it, and it always counts in free to spend. One of them is
  // where pay lands.
  SPENDING: 'SPENDING',
  // Money put aside, a cash ISA included. Kept out of free to spend unless switched on.
  SAVINGS: 'SAVINGS'
} as const;

export type AccountKind = (typeof AccountKind)[keyof typeof AccountKind];

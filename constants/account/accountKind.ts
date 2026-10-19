// What a bank account is for
export const AccountKind = {
  // Where pay lands and payments go out. Phase 1 has one per budget, and it always counts in free to
  // spend.
  CURRENT: 'CURRENT',
  // Money put aside, a cash ISA included. Kept out of free to spend unless switched on.
  SAVINGS: 'SAVINGS'
} as const;

export type AccountKind = (typeof AccountKind)[keyof typeof AccountKind];

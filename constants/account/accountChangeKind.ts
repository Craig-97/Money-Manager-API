import { AccountRecordKind } from './accountRecordKind';

// What moved an account's balance, as its history shows it: its own records, or a payment
export const AccountChangeKind = {
  ...AccountRecordKind,
  // A payment out of it, or an income into it
  PAYMENT: 'PAYMENT',
  // Money a payment moved into it from another account
  MOVE_IN: 'MOVE_IN',
  // A payment that moved money from it into another account
  MOVE_OUT: 'MOVE_OUT'
} as const;

export type AccountChangeKind = (typeof AccountChangeKind)[keyof typeof AccountChangeKind];

// What happened to a recurring payment whose date passed last cycle without being paid or skipped,
// as told at payday
export const LeftOverOutcome = {
  // It went out. Recorded as paid, without changing the balance confirmed at payday.
  PAID: 'PAID',
  // It didn't go out. Recorded as skipped.
  SKIPPED: 'SKIPPED',
  // Still to pay: it stays due, shown as overdue
  DUE: 'DUE'
} as const;

export type LeftOverOutcome = (typeof LeftOverOutcome)[keyof typeof LeftOverOutcome];

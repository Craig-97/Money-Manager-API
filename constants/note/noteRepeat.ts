// How often a note's date comes round
export const NoteRepeat = {
  NONE: 'NONE',
  MONTHLY: 'MONTHLY',
  QUARTERLY: 'QUARTERLY',
  BIANNUALLY: 'BIANNUALLY',
  YEARLY: 'YEARLY',
  // On each of its linked payment's dates, so it moves when the payment does. Needs a payment; the
  // note's own date isn't used.
  WITH_PAYMENT: 'WITH_PAYMENT'
} as const;

export type NoteRepeat = (typeof NoteRepeat)[keyof typeof NoteRepeat];

// How often a note's date comes round
export const NoteRepeat = {
  NONE: 'NONE',
  YEARLY: 'YEARLY'
} as const;

export type NoteRepeat = (typeof NoteRepeat)[keyof typeof NoteRepeat];

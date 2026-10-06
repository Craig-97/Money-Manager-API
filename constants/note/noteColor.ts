// The tag colours a note can have
export const NoteColor = {
  BLUE: 'BLUE',
  GREEN: 'GREEN',
  AMBER: 'AMBER',
  ROSE: 'ROSE',
  VIOLET: 'VIOLET'
} as const;

export type NoteColor = (typeof NoteColor)[keyof typeof NoteColor];

import type { NoteColor } from '../constants/noteColor';

export interface NoteInput {
  account?: string;
  body?: string;
  color?: NoteColor;
}

// Create mutations rely on these fields being present even though the schema marks them optional
export type CreateNoteInput = NoteInput & { account: string; body: string };

import type { NoteColor } from '../../constants/note/noteColor';
import type { NoteRepeat } from '../../constants/note/noteRepeat';

export interface NoteFields {
  body: string;
  color?: NoteColor;
  // YYYY-MM-DD; null takes the date off
  date?: string | null;
  remind?: number[];
  repeat?: NoteRepeat;
  // A recurring payment on the same account; null unlinks it
  payment?: string | null;
}

export interface CreateNoteInput extends NoteFields {
  accountId: string;
}

export type UpdateNoteInput = Partial<NoteFields>;

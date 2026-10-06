import type { NoteColor } from '../../constants/note/noteColor';

export interface CreateNoteInput {
  accountId: string;
  body: string;
  color?: NoteColor;
}

export interface UpdateNoteInput {
  body?: string;
  color?: NoteColor;
}

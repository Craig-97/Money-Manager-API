export interface NoteInput {
  account?: string;
  body?: string;
}

// Create mutations rely on these fields being present even though the schema marks them optional
export type CreateNoteInput = NoteInput & { account: string; body: string };

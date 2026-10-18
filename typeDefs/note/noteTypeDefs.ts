import { NoteColor } from '../../constants/note/noteColor';
import { NoteRepeat } from '../../constants/note/noteRepeat';
import { gqlEnum } from '../../utils/helpers/enumHelpers';

export const noteTypeDefs = `
  ${gqlEnum('NoteColor', NoteColor)}
  ${gqlEnum('NoteRepeat', NoteRepeat)}

  type Note {
    id: ID!
    account: ID!
    body: String!
    color: NoteColor!
    # A day the note is about, e.g. an MOT
    date: String
    # Days before the date to remind, e.g. [30, 7]: 0, 1, 7, 14 or 30. Only used with a date.
    remind: [Int!]!
    # Whether the date comes round every year
    repeat: NoteRepeat!
    # The recurring payment it's about, on the same account
    payment: ID
    createdAt: String!
    updatedAt: String!
  }

  input CreateNoteInput {
    accountId: ID!
    body: String!
    color: NoteColor
    # YYYY-MM-DD
    date: String
    remind: [Int!]
    repeat: NoteRepeat
    payment: ID
  }

  # Whatever is left out stays as it is; a null date or payment takes it off
  input UpdateNoteInput {
    body: String
    color: NoteColor
    date: String
    remind: [Int!]
    repeat: NoteRepeat
    payment: ID
  }

  type NoteResponse {
    note: Note
    success: Boolean!
  }

  type Mutation {
    createNote(input: CreateNoteInput!): NoteResponse!
    updateNote(id: ID!, input: UpdateNoteInput!): NoteResponse!
    deleteNote(id: ID!): DeleteResponse!
  }
`;

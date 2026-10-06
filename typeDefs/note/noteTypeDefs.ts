import { NoteColor } from '../../constants/note/noteColor';
import { gqlEnum } from '../../utils/helpers/enumHelpers';

export const noteTypeDefs = `
  ${gqlEnum('NoteColor', NoteColor)}

  type Note {
    id: ID!
    account: ID!
    body: String!
    color: NoteColor!
    createdAt: String!
    updatedAt: String!
  }

  input CreateNoteInput {
    accountId: ID!
    body: String!
    color: NoteColor
  }

  input UpdateNoteInput {
    body: String
    color: NoteColor
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

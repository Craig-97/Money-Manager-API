exports.typeDefs = `
  type Query {
    notes: [Note!]!
    note(id: ID): Note
  }

  type Note {
    id: ID!
    account: ID!
    body: String!
  }

  input NoteInput {
    account: ID
    body: String
  }

  type NoteResponse {
    note: Note
    success: Boolean
  }

  type Mutation {
    createNote(note: NoteInput!): NoteResponse!
    editNote(id: ID!, note: NoteInput!): NoteResponse!
    deleteNote(id: ID!): NoteResponse!
  }
`;

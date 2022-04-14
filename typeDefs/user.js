exports.typeDefs = `
  type Query {
    users: [User!]!
    user(id: ID): User
    login(email: String!, password: String!): AuthData!
  }

  type User {
    id: ID!
    account: ID
    email: String!
    password: String
  }

  input UserInput {
    email: String!
    password: String!
    account: ID
  }

  type UserResponse {
    user: User
    account: ID
    success: Boolean
  }

  type AuthData {
    userId: ID!
    token: String!
    tokenExpiration: Int!
  }

  type Mutation {
    createUser(user: UserInput!): UserResponse!
    editUser(id: ID!, user: UserInput!): UserResponse!
    deleteUser(id: ID!): UserResponse!
  }
`;

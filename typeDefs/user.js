exports.typeDefs = `
  type Query {
    users: [User!]!
    user(id: ID): User
    login(email: String!, password: String!): AuthData!
    tokenFindUser: User
  }

  type User {
    id: ID!
    account: ID
    email: String!
    firstName: String!
    surname: String!
  }

  input UserInput {
    email: String!
    password: String!
    account: ID
    firstName: String!
    surname: String!
  }

  type UserResponse {
    user: User
    account: ID
    success: Boolean
  }

  type AuthData {
    user: User!
    token: String!
    tokenExpiration: Int!
  }

  type Mutation {
    registerAndLogin(user: UserInput): AuthData!
    createUser(user: UserInput!): UserResponse!
    editUser(id: ID!, user: UserInput!): UserResponse!
    deleteUser(id: ID!): UserResponse!
  }
`;

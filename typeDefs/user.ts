export const typeDefs = `
  type Query {
    users: [User!]!
    user(id: ID): User
    login(email: String!, password: String!): AuthData!
    tokenFindUser: User
    passwordResetTokenValid(token: String!): Boolean!
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

  input UserDetailsInput {
    firstName: String!
    surname: String!
    email: String!
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

  type PasswordResetResponse {
    success: Boolean!
  }

  type Mutation {
    registerAndLogin(user: UserInput): AuthData!
    requestPasswordReset(email: String!): PasswordResetResponse!
    resetPassword(token: String!, password: String!): AuthData!
    createUser(user: UserInput!): UserResponse!
    editUser(id: ID!, user: UserInput!): UserResponse!
    deleteUser(id: ID!): UserResponse!
    # Change the signed-in user's name and email
    updateCurrentUser(input: UserDetailsInput!): UserResponse!
    # Change the signed-in user's password; the current one has to be right
    changePassword(currentPassword: String!, newPassword: String!): UserResponse!
    # Delete the signed-in user and everything on their account
    deleteCurrentUser: UserResponse!
  }
`;

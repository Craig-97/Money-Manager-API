import { ThemePreference } from '../constants/themePreference';
import { gqlEnum } from '../utils/helpers/enumHelpers';

export const typeDefs = `
  ${gqlEnum('ThemePreference', ThemePreference)}

  type Query {
    users: [User!]!
    user(id: ID): User
    tokenFindUser: User
    passwordResetTokenValid(token: String!): PasswordResetTokenCheck!
  }

  type User {
    id: ID!
    account: ID
    email: String!
    firstName: String!
    surname: String!
    # Not chosen yet when null, so a device keeps what it already shows
    theme: ThemePreference
    accent: String
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

  type PasswordResetTokenCheck {
    valid: Boolean!
    # The address the link was sent to, for the reset page to show; null when the link is not valid
    email: String
  }

  type PasswordResetResponse {
    success: Boolean!
  }

  type Mutation {
    # Signs in and sets the httpOnly refresh cookie
    login(email: String!, password: String!): AuthData!
    # Swaps the refresh cookie for a new access token and a new cookie; UNAUTHENTICATED when there is none
    refreshSession: AuthData!
    # Ends this device's session and clears its cookie
    logout: PasswordResetResponse!
    # Ends every device's session, this one included, and clears this device's cookie
    logoutEverywhere: PasswordResetResponse!
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
    # Save the signed-in user's theme and accent; whatever is left out stays as it is
    updatePreferences(theme: ThemePreference, accent: String): UserResponse!
  }
`;

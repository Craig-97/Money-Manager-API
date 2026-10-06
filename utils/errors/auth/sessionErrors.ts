import { GraphQLError } from 'graphql';

// Signing in, staying signed in, and resetting a password

export const INVALID_CREDENTIALS = () =>
  new GraphQLError('Password is incorrect', {
    extensions: { code: 'INVALID_CREDENTIALS' }
  });

export const REFRESH_TOKEN_INVALID = () =>
  new GraphQLError('Your session has ended. Sign in again', {
    extensions: { code: 'UNAUTHENTICATED', invalid: true }
  });

export const PASSWORD_RESET_TOKEN_INVALID = () =>
  new GraphQLError('This password reset link is invalid or has expired', {
    extensions: { code: 'PASSWORD_RESET_TOKEN_INVALID' }
  });

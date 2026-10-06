import { GraphQLError } from 'graphql';

// UNAUTHENTICATED: no usable access token. The front end reads `expired`, `invalid` and `revoked`
// to decide whether to refresh the session or explain why it ended.

export const TOKEN_EXPIRED = () =>
  new GraphQLError('Unauthenticated! - Expired token', {
    extensions: { code: 'UNAUTHENTICATED', expired: true }
  });

export const TOKEN_REVOKED = () =>
  new GraphQLError('Unauthenticated! - Signed out', {
    extensions: { code: 'UNAUTHENTICATED', invalid: true, revoked: true }
  });

export const TOKEN_INVALID = () =>
  new GraphQLError('Unauthenticated! - Invalid token', {
    extensions: { code: 'UNAUTHENTICATED', invalid: true }
  });

// FORBIDDEN: signed in, but the data isn't theirs

export const FORBIDDEN = (message = 'Unauthorized! You can only modify your own data') =>
  new GraphQLError(message, {
    extensions: { code: 'FORBIDDEN', unauthorized: true }
  });

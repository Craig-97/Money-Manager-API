import { GraphQLError } from 'graphql';

// Input errors with their own codes, which the front end already handles, rather than BAD_USER_INPUT

export const INVALID_PASSWORD = () =>
  new GraphQLError('Password must be at least 8 characters and contain a number', {
    extensions: { code: 'INVALID_PASSWORD' }
  });

export const INVALID_ACCENT = () =>
  new GraphQLError('Accent must be a hex colour like #7C3AED', {
    extensions: { code: 'INVALID_ACCENT' }
  });

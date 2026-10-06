import type { GraphQLFormattedError } from 'graphql';
import { unwrapResolverError } from '@apollo/server/errors';
import { logger } from '../../logger';

// Errors the API means to send carry their own code. Anything else is a bug or an outage
const isUnexpected = (formatted: GraphQLFormattedError) => {
  const code = formatted.extensions?.code;
  return !code || code === 'INTERNAL_SERVER_ERROR';
};

/*
 * Logs unexpected errors in full and sends the client a plain message instead, so database and
 * library messages (which can name ids and internals) never reach the browser. Errors with their
 * own code, like USER_EXISTS or BAD_USER_INPUT, pass through untouched.
 */
export const formatError = (formatted: GraphQLFormattedError, error: unknown): GraphQLFormattedError => {
  if (!isUnexpected(formatted)) return formatted;

  logger.error({ err: unwrapResolverError(error), path: formatted.path }, 'Unexpected error');
  return {
    message: 'Something went wrong. Please try again.',
    locations: formatted.locations,
    path: formatted.path,
    extensions: { code: 'INTERNAL_SERVER_ERROR' }
  };
};

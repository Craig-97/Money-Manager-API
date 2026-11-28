import { GraphQLError } from 'graphql';

export const PAYMENT_RECORD_NOT_FOUND = (id: unknown) =>
  new GraphQLError(`Payment record with id '${id}' does not exist`, {
    extensions: { code: 'PAYMENT_RECORD_NOT_FOUND' }
  });

// Payday confirmed the bank balance since, so taking it back would make that balance wrong
export const PAYMENT_RECORD_CLOSED = () =>
  new GraphQLError("This is from before the last payday, so it can't be undone", {
    extensions: { code: 'PAYMENT_RECORD_CLOSED' }
  });

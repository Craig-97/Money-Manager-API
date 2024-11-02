import { GraphQLError } from 'graphql';
export const PAYMENT_NOT_FOUND = id =>
  new GraphQLError(`Payment with id '${id}' does not exist`, {
    extensions: { code: 'PAYMENT_NOT_FOUND' }
  });

export const PAYMENTS_NOT_FOUND = accountId =>
  new GraphQLError(`No one-off payments exist for account with ID '${accountId}'`, {
    extensions: { code: 'PAYMENTS_NOT_FOUND' }
  });

export const PAYMENT_EXISTS = name =>
  new GraphQLError(`Payment with name '${name}' already exists`, {
    extensions: { code: 'PAYMENT_EXISTS' }
  });

export const PAYMENT_UPDATE_FAILED = () =>
  new GraphQLError('OneOffPayment cannot be updated', {
    extensions: { code: 'PAYMENT_UPDATE_FAILED' }
  });

export const PAYMENT_DELETE_FAILED = () =>
  new GraphQLError('OneOffPayment cannot be deleted', {
    extensions: { code: 'PAYMENT_DELETE_FAILED' }
  });

import { GraphQLError } from 'graphql';
export const PAYMENT_NOT_FOUND = (id: unknown) =>
  new GraphQLError(`Payment with id '${id}' does not exist`, {
    extensions: { code: 'PAYMENT_NOT_FOUND' }
  });

export const PAYMENTS_NOT_FOUND = (budgetId: unknown) =>
  new GraphQLError(`No one-off payments exist for budget with ID '${budgetId}'`, {
    extensions: { code: 'PAYMENTS_NOT_FOUND' }
  });

export const PAYMENT_EXISTS = (name: string) =>
  new GraphQLError(`Payment with name '${name}' already exists`, {
    extensions: { code: 'PAYMENT_EXISTS' }
  });

export const PAYMENT_DELETE_FAILED = () =>
  new GraphQLError('OneOffPayment cannot be deleted', {
    extensions: { code: 'PAYMENT_DELETE_FAILED' }
  });

import { GraphQLError } from 'graphql';

export const RECURRING_PAYMENT_NOT_FOUND = id =>
  new GraphQLError(`Recurring payment with id '${id}' does not exist`, {
    extensions: { code: 'RECURRING_PAYMENT_NOT_FOUND' }
  });

export const RECURRING_PAYMENTS_NOT_FOUND = accountId =>
  new GraphQLError(`No recurring payments exist for account with ID '${accountId}'`, {
    extensions: { code: 'RECURRING_PAYMENTS_NOT_FOUND' }
  });

export const RECURRING_PAYMENT_EXISTS = name =>
  new GraphQLError(`Recurring payment with name '${name}' already exists`, {
    extensions: { code: 'RECURRING_PAYMENT_EXISTS' }
  });

export const RECURRING_PAYMENT_UPDATE_FAILED = () =>
  new GraphQLError('Recurring payment cannot be updated', {
    extensions: { code: 'RECURRING_PAYMENT_UPDATE_FAILED' }
  });

export const RECURRING_PAYMENT_DELETE_FAILED = () =>
  new GraphQLError('Recurring payment cannot be deleted', {
    extensions: { code: 'RECURRING_PAYMENT_DELETE_FAILED' }
  });

export const INVALID_RECURRING_PAYMENT_TYPE = () =>
  new GraphQLError('Invalid payment type. Must be either INCOME or EXPENSE', {
    extensions: { code: 'INVALID_RECURRING_PAYMENT_TYPE' }
  });

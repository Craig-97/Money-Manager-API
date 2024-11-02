import { GraphQLError } from 'graphql';

export const BILL_NOT_FOUND = id =>
  new GraphQLError(`Bill with id '${id}' does not exist`, {
    extensions: { code: 'BILL_NOT_FOUND' }
  });

export const BILLS_NOT_FOUND = accountId =>
  new GraphQLError(`No bills exist for account with ID '${accountId}'`, {
    extensions: { code: 'BILLS_NOT_FOUND' }
  });

export const BILL_EXISTS = name =>
  new GraphQLError(`Bill with name '${name}' already exists`, {
    extensions: { code: 'BILL_EXISTS' }
  });

export const BILL_UPDATE_FAILED = () =>
  new GraphQLError('Bill cannot be updated', { extensions: { code: 'BILL_UPDATE_FAILED' } });

export const BILL_DELETE_FAILED = () =>
  new GraphQLError('Bill cannot be deleted', { extensions: { code: 'BILL_DELETE_FAILED' } });

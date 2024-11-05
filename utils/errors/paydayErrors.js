import { GraphQLError } from 'graphql';

export const PAYDAY_NOT_FOUND = id =>
  new GraphQLError(`Payday with id '${id}' does not exist`, {
    extensions: { code: 'PAYDAY_NOT_FOUND' }
  });

export const PAYDAYS_NOT_FOUND = () =>
  new GraphQLError('No paydays currently exist', { extensions: { code: 'PAYDAYS_NOT_FOUND' } });

export const PAYDAY_EXISTS = () =>
  new GraphQLError('Account already has a payday configuration', {
    extensions: { code: 'PAYDAY_EXISTS' }
  });

export const PAYDAY_UPDATE_FAILED = () =>
  new GraphQLError('Payday could not be updated', { extensions: { code: 'PAYDAY_UPDATE_FAILED' } });

export const PAYDAY_DELETE_FAILED = () =>
  new GraphQLError('Payday cannot be deleted', { extensions: { code: 'PAYDAY_DELETE_FAILED' } });

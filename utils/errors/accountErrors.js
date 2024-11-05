import { GraphQLError } from 'graphql';

export const ACCOUNT_NOT_FOUND = id =>
  new GraphQLError(`Account with id '${id}' does not exist`, {
    extensions: { code: 'ACCOUNT_NOT_FOUND' }
  });

export const ACCOUNT_NOT_LINKED = () =>
  new GraphQLError('User does not have a linked account', {
    extensions: { code: 'ACCOUNT_NOT_LINKED' }
  });

export const NO_ACCOUNTS = () =>
  new GraphQLError('No accounts exist', { extensions: { code: 'ACCOUNT_NOT_FOUND' } });

export const ACCOUNT_EXISTS = id =>
  new GraphQLError(`Account with id '${id}' already exists`, {
    extensions: { code: 'ACCOUNT_EXISTS' }
  });

export const ACCOUNT_UPDATE_FAILED = () =>
  new GraphQLError(
    'No valid fields provided for update. Please provide at least one of: bankBalance, monthlyIncome.',
    {
      extensions: {
        code: 'NO_VALID_FIELDS_PROVIDED'
      }
    }
  );

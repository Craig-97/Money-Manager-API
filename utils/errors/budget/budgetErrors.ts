import { GraphQLError } from 'graphql';

export const BUDGET_NOT_FOUND = (id: unknown) =>
  new GraphQLError(`Budget with id '${id}' does not exist`, {
    extensions: { code: 'BUDGET_NOT_FOUND' }
  });

export const BUDGET_NOT_LINKED = () =>
  new GraphQLError('User does not have a linked budget', {
    extensions: { code: 'BUDGET_NOT_LINKED' }
  });

export const BUDGET_EXISTS = (id: unknown) =>
  new GraphQLError(`Budget with id '${id}' already exists`, {
    extensions: { code: 'BUDGET_EXISTS' }
  });

export const BUDGET_UPDATE_FAILED = () =>
  new GraphQLError(
    'No valid fields provided for update. Please provide at least one of: bankBalance, monthlyIncome.',
    {
      extensions: {
        code: 'NO_VALID_FIELDS_PROVIDED'
      }
    }
  );

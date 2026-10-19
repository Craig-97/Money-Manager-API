import { GraphQLError } from 'graphql';

export const ACCOUNT_NOT_FOUND = (id: unknown) =>
  new GraphQLError(`Account with id '${id}' does not exist`, {
    extensions: { code: 'ACCOUNT_NOT_FOUND' }
  });

// A budget saved before accounts existed, until npm run migrate:accounts gives it one
export const CURRENT_ACCOUNT_MISSING = () =>
  new GraphQLError('This budget has no current account yet', {
    extensions: { code: 'CURRENT_ACCOUNT_MISSING' }
  });

// The current account always counts and can't be deleted: pay lands there
export const CURRENT_ACCOUNT_FIXED = (what: string) =>
  new GraphQLError(`The current account can't be ${what}`, {
    extensions: { code: 'CURRENT_ACCOUNT_FIXED' }
  });

// Paying into savings is for money moved out of the current account: an expense, and not a debt
export const PAYS_INTO_NOT_ALLOWED = () =>
  new GraphQLError('Only an expense that isn’t a debt can pay into savings', {
    extensions: { code: 'PAYS_INTO_NOT_ALLOWED', field: 'paysInto' }
  });

// Payments can only pay into a savings account in the same budget
export const NOT_A_SAVINGS_ACCOUNT = (id: unknown) =>
  new GraphQLError(`Account with id '${id}' isn't a savings account in this budget`, {
    extensions: { code: 'NOT_A_SAVINGS_ACCOUNT', field: 'paysInto' }
  });

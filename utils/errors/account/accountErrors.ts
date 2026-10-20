import { GraphQLError } from 'graphql';

export const ACCOUNT_NOT_FOUND = (id: unknown) =>
  new GraphQLError(`Account with id '${id}' does not exist`, {
    extensions: { code: 'ACCOUNT_NOT_FOUND' }
  });

// A budget saved before accounts existed, until npm run migrate:accounts gives it one
export const PAID_INTO_ACCOUNT_MISSING = () =>
  new GraphQLError('This budget has no account for pay to land in yet', {
    extensions: { code: 'PAID_INTO_ACCOUNT_MISSING' }
  });

// Pay has to land somewhere: the account it lands in can't be deleted, kept out of free to spend
// or made savings. Making another account where pay lands moves it.
export const PAID_INTO_ACCOUNT_FIXED = (what: string) =>
  new GraphQLError(`The account you're paid into can't be ${what}`, {
    extensions: { code: 'PAID_INTO_ACCOUNT_FIXED' }
  });

// Only an account to spend from can be where pay lands
export const PAID_INTO_NOT_SPENDING = () =>
  new GraphQLError('Only a spending account can be where you get paid', {
    extensions: { code: 'PAID_INTO_NOT_SPENDING', field: 'paidInto' }
  });

// Moving money to another account is for an expense that isn't a debt
export const PAYS_INTO_NOT_ALLOWED = () =>
  new GraphQLError('Only an expense that isn’t a debt can move money to another account', {
    extensions: { code: 'PAYS_INTO_NOT_ALLOWED', field: 'paysInto' }
  });

// Money moves to a different account from the one it comes out of
export const PAYS_INTO_SAME_ACCOUNT = () =>
  new GraphQLError('A payment can’t move money into the account it comes out of', {
    extensions: { code: 'PAYS_INTO_SAME_ACCOUNT', field: 'paysInto' }
  });

// An account a payment names has to be in its budget, and an expense comes out of a spending
// account
export const ACCOUNT_NOT_ALLOWED = (id: unknown, field: 'account' | 'paysInto') =>
  new GraphQLError(`Account with id '${id}' can't be used here`, {
    extensions: { code: 'ACCOUNT_NOT_ALLOWED', field }
  });

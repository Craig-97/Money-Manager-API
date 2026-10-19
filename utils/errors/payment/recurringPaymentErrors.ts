import { GraphQLError } from 'graphql';

export const RECURRING_PAYMENT_NOT_FOUND = (id: unknown) =>
  new GraphQLError(`Recurring payment with id '${id}' does not exist`, {
    extensions: { code: 'RECURRING_PAYMENT_NOT_FOUND' }
  });

export const RECURRING_PAYMENTS_NOT_FOUND = (budgetId: unknown) =>
  new GraphQLError(`No recurring payments exist for budget with ID '${budgetId}'`, {
    extensions: { code: 'RECURRING_PAYMENTS_NOT_FOUND' }
  });

export const RECURRING_PAYMENT_EXISTS = (name: string) =>
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

export const DEBT_NOT_TRACKED = (id: unknown) =>
  new GraphQLError(`Recurring payment with id '${id}' isn't tracked as a debt`, {
    extensions: { code: 'DEBT_NOT_TRACKED' }
  });

// A field error like BAD_USER_INPUT, as the form shows it against the amount
export const OVERPAYMENT_TOO_LARGE = () =>
  new GraphQLError("That's more than is left to pay", {
    extensions: { code: 'BAD_USER_INPUT', field: 'amount' }
  });

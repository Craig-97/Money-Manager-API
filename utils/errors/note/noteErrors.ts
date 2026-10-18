import { GraphQLError } from 'graphql';
export const NOTE_NOT_FOUND = (id: unknown) =>
  new GraphQLError(`Note with id '${id}' does not exist`, {
    extensions: { code: 'NOTE_NOT_FOUND' }
  });

export const NOTE_EXISTS = (body: string) =>
  new GraphQLError(`Note with body '${body}' already exists`, {
    extensions: { code: 'NOTE_EXISTS' }
  });

export const NOTE_UPDATE_FAILED = () =>
  new GraphQLError('Note cannot be updated', { extensions: { code: 'NOTE_UPDATE_FAILED' } });

export const NOTE_DELETE_FAILED = () =>
  new GraphQLError('Note cannot be deleted', { extensions: { code: 'NOTE_DELETE_FAILED' } });

// Following a payment's dates needs a payment to follow
export const NOTE_REPEAT_NEEDS_PAYMENT = () =>
  new GraphQLError('A note can only repeat with a payment once it’s linked to one', {
    extensions: { code: 'BAD_USER_INPUT', field: 'repeat' }
  });

// The payment a note is linked to has to be one of the account's recurring payments
export const NOTE_PAYMENT_NOT_FOUND = (id: unknown) =>
  new GraphQLError(`Recurring payment with id '${id}' does not exist on this account`, {
    extensions: { code: 'BAD_USER_INPUT', field: 'payment' }
  });

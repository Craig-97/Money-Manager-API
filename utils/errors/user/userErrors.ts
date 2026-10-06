import { GraphQLError } from 'graphql';

export const USER_NOT_FOUND = (id: unknown) =>
  new GraphQLError(`User with id '${id}' does not exist`, {
    extensions: { code: 'USER_NOT_FOUND' }
  });

export const USER_EMAIL_NOT_FOUND = () =>
  new GraphQLError(`We couldn't find a user with that email address`, {
    extensions: { code: 'USER_EMAIL_NOT_FOUND' }
  });

export const USER_EXISTS = () =>
  new GraphQLError(`Account with that email address already exists`, {
    extensions: { code: 'USER_EXISTS' }
  });

export const USER_DELETE_FAILED = () =>
  new GraphQLError('User cannot be deleted', { extensions: { code: 'USER_DELETE_FAILED' } });

import { GraphQLError } from 'graphql';

export const USERS_NOT_FOUND = () =>
  new GraphQLError('No users currently exist', {
    extensions: { code: 'USERS_NOT_FOUND' }
  });

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

export const INVALID_CREDENTIALS = () =>
  new GraphQLError('Password is incorrect', {
    extensions: { code: 'INVALID_CREDENTIALS' }
  });

export const USER_DELETE_FAILED = () =>
  new GraphQLError('User cannot be deleted', { extensions: { code: 'USER_DELETE_FAILED' } });

export const USER_UPDATE_FAILED = () =>
  new GraphQLError('User cannot be updated', {
    extensions: { code: 'USER_UPDATE_FAILED' }
  });

export const INVALID_PASSWORD = () =>
  new GraphQLError('Password must be at least 8 characters and contain a number', {
    extensions: { code: 'INVALID_PASSWORD' }
  });

export const PASSWORD_RESET_TOKEN_INVALID = () =>
  new GraphQLError('This password reset link is invalid or has expired', {
    extensions: { code: 'PASSWORD_RESET_TOKEN_INVALID' }
  });

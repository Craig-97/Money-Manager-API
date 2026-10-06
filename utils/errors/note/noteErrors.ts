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

import { GraphQLError } from 'graphql';

export const PAYDAY_NOT_FOUND = (id: unknown) =>
  new GraphQLError(`Payday with id '${id}' does not exist`, {
    extensions: { code: 'PAYDAY_NOT_FOUND' }
  });

export const PAYDAY_OVERRIDE_INVALID = (reason: string) =>
  new GraphQLError(reason, { extensions: { code: 'PAYDAY_OVERRIDE_INVALID' } });

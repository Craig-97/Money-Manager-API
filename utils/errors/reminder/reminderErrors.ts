import { GraphQLError } from 'graphql';

// Later puts a reminder away until a day, which has to be after today and within a year
export const REMINDER_UNTIL_INVALID = () =>
  new GraphQLError('Later needs a day after today and within a year', {
    extensions: { code: 'BAD_USER_INPUT', field: 'until' }
  });

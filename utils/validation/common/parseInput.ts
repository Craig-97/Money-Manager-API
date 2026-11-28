import { GraphQLError } from 'graphql';
import type { z } from 'zod';

const BAD_USER_INPUT = (issue: z.core.$ZodIssue) =>
  new GraphQLError(issue.message, {
    extensions: { code: 'BAD_USER_INPUT', field: issue.path.join('.') || undefined }
  });

/*
 * Checks an input against a schema and gives it back cleaned (names trimmed, for example) with the
 * same type. The schemas only refine what GraphQL already typed, so the shape doesn't change. An
 * input that doesn't fit becomes a BAD_USER_INPUT error naming the field, or the error passed in,
 * for rules the front end already has its own error code for.
 */
export const parseInput = <I>(
  schema: z.ZodType,
  value: I,
  toError: (issue: z.core.$ZodIssue) => GraphQLError = BAD_USER_INPUT
): I => {
  const result = schema.safeParse(value);
  if (!result.success) {
    throw toError(result.error.issues[0]);
  }
  return result.data as I;
};

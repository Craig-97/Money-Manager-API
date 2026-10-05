import type { NextFunction, Request, RequestHandler, Response } from 'express';
import {
  rateLimit,
  ipKeyGenerator,
  MemoryStore,
  MINUTE,
  HOUR,
  type RateLimitInfo
} from 'express-rate-limit';
import { Kind, parse, type ValueNode } from 'graphql';

// Root fields a request calls, with the email argument where one is given
interface RootField {
  name: string;
  email?: string;
}

interface Limit {
  // Root fields this limit counts
  fields: string[];
  windowMs: number;
  limit: number;
  // Count per IP and email rather than per IP alone, so one person can't lock out everyone on their network
  perEmail?: boolean;
}

const LIMITS: Limit[] = [
  // Password guessing against a single account
  { fields: ['login'], windowMs: 15 * MINUTE, limit: 10, perEmail: true },
  // Password guessing spread across many accounts
  { fields: ['login'], windowMs: 15 * MINUTE, limit: 50 },
  // Reset email spam to a single address
  { fields: ['requestPasswordReset'], windowMs: HOUR, limit: 3, perEmail: true },
  // Reset email spam to many addresses
  { fields: ['requestPasswordReset'], windowMs: HOUR, limit: 10 },
  // Refresh token guessing
  { fields: ['refreshSession'], windowMs: 15 * MINUTE, limit: 60 },
  // Reset token guessing
  { fields: ['resetPassword', 'passwordResetTokenValid'], windowMs: 15 * MINUTE, limit: 20 }
];

const stores = new Set<MemoryStore>();

// Clears every count, so tests don't carry attempts from one test into the next
export const resetRateLimits = () => stores.forEach(store => store.resetAll());

const argumentValue = (value: ValueNode, variables: Record<string, unknown>) => {
  if (value.kind === Kind.STRING) return value.value;
  if (value.kind === Kind.VARIABLE) {
    const variable = variables[value.name.value];
    return typeof variable === 'string' ? variable : undefined;
  }
  return undefined;
};

// Reads the root fields from the GraphQL body. A body that doesn't parse is left for Apollo to reject
const rootFields = (req: Request): RootField[] => {
  if (!req.rootFields) {
    // Apollo also accepts operations in the URL of a GET request, so read those too
    const source = req.method === 'GET' ? req.query : req.body;
    const { query, variables: rawVariables } = (source ?? {}) as { query?: unknown; variables?: unknown };
    req.rootFields = [];
    if (typeof query === 'string') {
      try {
        const variables = typeof rawVariables === 'string' ? JSON.parse(rawVariables) : rawVariables;
        const vars = variables && typeof variables === 'object' ? (variables as Record<string, unknown>) : {};
        for (const definition of parse(query).definitions) {
          if (definition.kind !== Kind.OPERATION_DEFINITION) continue;
          for (const selection of definition.selectionSet.selections) {
            if (selection.kind !== Kind.FIELD) continue;
            const emailArg = selection.arguments?.find(arg => arg.name.value === 'email');
            const email = emailArg && argumentValue(emailArg.value, vars);
            req.rootFields.push({
              name: selection.name.value,
              email: email?.trim().toLowerCase()
            });
          }
        }
      } catch {
        req.rootFields = [];
      }
    }
  }
  return req.rootFields;
};

const matchingField = (req: Request, fields: string[]) =>
  rootFields(req).find(field => fields.includes(field.name));

const createLimiter = ({ fields, windowMs, limit, perEmail }: Limit): RequestHandler => {
  const store = new MemoryStore();
  stores.add(store);

  return rateLimit({
    windowMs,
    limit,
    store,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    skip: req => !matchingField(req, fields),
    keyGenerator: req => {
      const ip = ipKeyGenerator(req.ip ?? '');
      return perEmail ? `${ip}:${matchingField(req, fields)?.email ?? ''}` : ip;
    },
    // Answer in GraphQL's response format, so Apollo Client reads it as an error with a code
    // rather than a failed request
    handler: (req, res) => {
      const { resetTime } = (req as Request & { rateLimit: RateLimitInfo }).rateLimit;
      const retryAfter = Math.max(1, Math.ceil(((resetTime?.getTime() ?? Date.now()) - Date.now()) / 1000));
      const minutes = Math.ceil(retryAfter / 60);
      res
        .status(429)
        .type('application/graphql-response+json')
        .json({
          errors: [
            {
              message: `Too many attempts. Try again in ${minutes} minute${minutes === 1 ? '' : 's'}.`,
              extensions: { code: 'TOO_MANY_REQUESTS', retryAfter }
            }
          ]
        });
    }
  });
};

// Limits the login and password reset operations; every other operation passes straight through
export const createAuthRateLimit = () => {
  const limiters = LIMITS.map(createLimiter);

  return (req: Request, res: Response, next: NextFunction) => {
    const run = (index: number): void => {
      if (index === limiters.length || res.headersSent) {
        if (!res.headersSent) next();
        return;
      }
      limiters[index](req, res, err => (err ? next(err) : run(index + 1)));
    };
    run(0);
  };
};

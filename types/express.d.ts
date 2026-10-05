import type { Types } from 'mongoose';

declare global {
  namespace Express {
    // Fields attached by the isAuth middleware and read by resolvers via the GraphQL context
    interface Request {
      isAuth: boolean;
      isExpired: boolean;
      // The token is genuine but was cancelled by signing out everywhere or a password change
      isRevoked: boolean;
      userId?: string;
      accountId?: Types.ObjectId;
      // Operations in the request, read once by the rate limiter
      rootFields?: { name: string; email?: string }[];
    }
  }
}

export {};

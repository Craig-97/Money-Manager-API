import type { Types } from 'mongoose';

declare global {
  namespace Express {
    // Fields attached by the isAuth middleware and read by resolvers via the GraphQL context
    interface Request {
      isAuth: boolean;
      isExpired: boolean;
      userId?: string;
      accountId?: Types.ObjectId;
    }
  }
}

export {};

import type { NextFunction, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { isValidObjectId, type Types } from 'mongoose';
import { Account } from '../models/account/Account';
import { User } from '../models/user/User';
import { authLog } from '../utils/logger';
import {
  FORBIDDEN,
  TOKEN_EXPIRED,
  TOKEN_INVALID,
  TOKEN_REVOKED
} from '../utils/errors';

export const isAuth = async (req: Request, _: Response, next: NextFunction) => {
  const authHeader = req.get('Authorization');
  const token = authHeader?.split(' ')[1];
  req.isAuth = false;
  req.isExpired = false;
  req.isRevoked = false;

  // Check auth header with token has been passed in request
  if (!authHeader || !token || token === '') {
    return next();
  }

  // Check auth token hasn't expired
  let decodedToken: string | jwt.JwtPayload;
  try {
    decodedToken = jwt.verify(token, process.env.JWT_KEY as string);
  } catch (err) {
    if (err instanceof Error && err.message === 'jwt expired') {
      req.isExpired = true;
    } else {
      // Not signed by this API, or tampered with
      authLog.warn({ event: 'token_invalid', ip: req.ip }, 'Invalid access token');
    }
    return next();
  }

  // Check decoded token is actually returned
  if (!decodedToken) {
    return next();
  }

  const userId = (decodedToken as jwt.JwtPayload).userId;
  // Runs on every request, so only the field it needs, as a plain object
  const user = await User.findById(userId).select('tokenVersion').lean();
  if (!user) {
    return next();
  }

  // Signing out everywhere, or changing the password, raised the version since this token was issued.
  // Tokens from before versions existed count as version 0.
  if (((decodedToken as jwt.JwtPayload).tv ?? 0) !== (user.tokenVersion ?? 0)) {
    req.isRevoked = true;
    return next();
  }

  // Request is now authorised and user id attached so user can be found via a token
  req.isAuth = true;
  req.userId = userId;
  next();
};

// Throws GraphQL errors based on authentication status
export const checkAuth = (req: Request) => {
  if (req.isExpired) {
    throw TOKEN_EXPIRED();
  } else if (req.isRevoked) {
    throw TOKEN_REVOKED();
  } else if (!req.isAuth) {
    throw TOKEN_INVALID();
  }
};

// The account has to belong to the signed-in user. Someone else's account is refused the same as one
// that doesn't exist, so the answer doesn't reveal which ids are real.
export const checkAccountAccess = async (
  accountId: Types.ObjectId | string | null | undefined,
  req: Request
) => {
  if (!req.userId || !accountId || !isValidObjectId(accountId)) {
    throw FORBIDDEN();
  }
  if (!(await Account.exists({ _id: accountId, user: req.userId }))) {
    throw FORBIDDEN();
  }
};

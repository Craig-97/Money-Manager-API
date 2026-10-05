import type { NextFunction, Request, Response } from 'express';
import { GraphQLError } from 'graphql';
import jwt from 'jsonwebtoken';
import type { Types } from 'mongoose';
import { User } from '../models/User';

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
    }
    return next();
  }

  // Check decoded token is actually returned
  if (!decodedToken) {
    return next();
  }

  // Get user and their account ID
  const userId = (decodedToken as jwt.JwtPayload).userId;
  const user = await User.findById(userId);
  if (!user) {
    return next();
  }

  // Signing out everywhere, or changing the password, raised the version since this token was issued.
  // Tokens from before versions existed count as version 0.
  if (((decodedToken as jwt.JwtPayload).tv ?? 0) !== (user.tokenVersion ?? 0)) {
    req.isRevoked = true;
    return next();
  }

  if (!req.accountId) {
    req.accountId = user.account;
  }

  // Request is now authorised and user id attached so user can be found via a token
  req.isAuth = true;
  req.userId = userId;
  next();
};

// Throws GraphQL errors based on authentication status
export const checkAuth = (req: Request) => {
  if (req.isExpired) {
    throw new GraphQLError('Unauthenticated! - Expired token', {
      extensions: {
        code: 'UNAUTHENTICATED',
        expired: true
      }
    });
  } else if (req.isRevoked) {
    throw new GraphQLError('Unauthenticated! - Signed out', {
      extensions: {
        code: 'UNAUTHENTICATED',
        invalid: true,
        revoked: true
      }
    });
  } else if (!req.isAuth) {
    throw new GraphQLError('Unauthenticated! - Invalid token', {
      extensions: {
        code: 'UNAUTHENTICATED',
        invalid: true
      }
    });
  }
};

// Check if user has permission to modify the resource
export const checkAccountAccess = async (
  resourceAccountId: Types.ObjectId | string,
  req: Request
) => {
  if (!req.accountId || resourceAccountId.toString() !== req.accountId.toString()) {
    throw new GraphQLError('Unauthorized! You can only modify your own data', {
      extensions: {
        code: 'FORBIDDEN',
        unauthorized: true
      }
    });
  }
};

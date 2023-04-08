import { GraphQLError } from 'graphql';
import jwt from 'jsonwebtoken';

export const isAuth = (req, _, next) => {
  const authHeader = req.get('Authorization');

  if (!authHeader) {
    req.isAuth = false;
    req.isExpired = false;
    return next();
  }
  const token = authHeader.split(' ')[1];
  if (!token || token === '') {
    req.isAuth = false;
    req.isExpired = false;
    return next();
  }
  let decodedToken;
  try {
    decodedToken = jwt.verify(token, process.env.JWT_KEY);
  } catch (err) {
    if (err.message === 'jwt expired') {
      req.isExpired = true;
    } else {
      req.isExpired = false;
    }
    req.isAuth = false;
    return next();
  }
  if (!decodedToken) {
    req.isAuth = false;
    return next();
  }
  req.isAuth = true;
  req.userId = decodedToken.userId;
  next();
};

export const checkAuth = req => {
  if (req.isExpired) {
    throw new GraphQLError('Unauthenticated! - Expired token', {
      extensions: {
        code: 'UNAUTHENTICATED',
        expired: true
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

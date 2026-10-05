import crypto from 'crypto';
import type { Request, Response } from 'express';

export const REFRESH_COOKIE = 'mm_refresh';
export const REFRESH_TOKEN_DAYS = 30;
// A person signed in on more devices than this loses the one that was signed in longest ago
export const MAX_REFRESH_TOKENS = 10;

const DAY_MS = 24 * 60 * 60 * 1000;

// Only a hash of each refresh token is stored, so a leaked database can't be used to sign in
export const hashRefreshToken = (token: string) =>
  crypto.createHash('sha256').update(token).digest('hex');

export const createRefreshToken = () => {
  const token = crypto.randomBytes(48).toString('hex');
  return {
    token,
    hash: hashRefreshToken(token),
    expires: new Date(Date.now() + REFRESH_TOKEN_DAYS * DAY_MS)
  };
};

// The cookie is only sent to /graphql, never read by scripts, and goes with same-site requests
// only. The Netlify rewrite makes /graphql first-party, which is what lets SameSite=Lax work.
const cookieOptions = () => ({
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'lax' as const,
  path: '/graphql'
});

export const setRefreshCookie = (res: Response, token: string) =>
  res.cookie(REFRESH_COOKIE, token, { ...cookieOptions(), maxAge: REFRESH_TOKEN_DAYS * DAY_MS });

export const clearRefreshCookie = (res: Response) => res.clearCookie(REFRESH_COOKIE, cookieOptions());

// Reads one cookie from the Cookie header, so the API doesn't need a cookie-parsing dependency
export const readRefreshCookie = (req: Request) => {
  const header = req.get('Cookie');
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const index = part.indexOf('=');
    if (index !== -1 && part.slice(0, index).trim() === REFRESH_COOKIE) {
      try {
        return decodeURIComponent(part.slice(index + 1).trim());
      } catch {
        return undefined;
      }
    }
  }
  return undefined;
};

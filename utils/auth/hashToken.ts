import crypto from 'crypto';

// Refresh and password reset tokens are stored only as a hash, so a leaked database can't be used
// to sign in. Lookups hash the token they're given the same way.
export const hashToken = (token: string) => crypto.createHash('sha256').update(token).digest('hex');

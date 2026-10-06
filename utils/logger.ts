import pino from 'pino';

/*
 * The API's logger. It writes one JSON object per line, which Render's log view can search and
 * filter. Tests are silent. Set LOG_LEVEL (debug, info, warn, error) to change how much is written.
 */
export const logger = pino({
  level: process.env.NODE_ENV === 'test' ? 'silent' : (process.env.LOG_LEVEL ?? 'info'),
  // Never written, even if a whole request or user ends up in a log line
  redact: {
    paths: [
      'password',
      '*.password',
      'token',
      '*.token',
      'req.headers.authorization',
      'req.headers.cookie',
      '*.refreshTokens',
      '*.passwordResetTokenHash'
    ],
    censor: '[redacted]'
  }
});

// Sign-ins, sessions and password changes, so unusual activity on an account can be traced
export const authLog = logger.child({ area: 'auth' });

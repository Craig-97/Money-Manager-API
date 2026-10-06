# Money-Manager-API
Backend API built for tracking finances using Node, Express JS, MongoDB and GraphQL

[See Front-end app here](https://github.com/Craig-97/Money-Manager)

## Environment variables

| Variable | Required | Description |
| --- | --- | --- |
| `MONGODB_CONNECTION_STRING` | Yes | MongoDB connection string |
| `JWT_KEY` | Yes | Secret used to sign login tokens |
| `PORT` | No | Port to listen on (default `4000`) |
| `TRUST_PROXY` | No | Number of proxies or load balancers in front of the API (e.g. `1`), so login and reset limits count each visitor's own IP. Leave unset when the API is reached directly |
| `CORS_ORIGINS` | No | Comma-separated front-end origins allowed to call the API from another origin, with cookies. `CLIENT_URL` is always allowed. The browser app normally calls the API through its own origin, so this is only for direct calls |
| `LOG_LEVEL` | No | How much to log: `debug`, `info` (default), `warn` or `error` |
| `CLIENT_URL` | No | Front-end origin used in password reset links (default `http://localhost:5173`) |
| `SMTP_HOST` | No | SMTP server for outgoing email. When unset, emails are logged to the console instead of sent |
| `SMTP_PORT` | No | SMTP port (default `587`) |
| `SMTP_SECURE` | No | `true` to connect over TLS (usually with port `465`) |
| `SMTP_USER` / `SMTP_PASS` | No | SMTP credentials |
| `EMAIL_FROM` | No | Sender address (default `Money Manager <no-reply@moneymanager.app>`) |

## Sessions

`login`, `registerAndLogin` and `resetPassword` return a short-lived access token (1 hour) for the client to keep in memory, and set a 30-day refresh token in an httpOnly `mm_refresh` cookie (`Secure` when `NODE_ENV=production`, `SameSite=Lax`, path `/graphql`). `refreshSession` swaps that cookie for a new access token and a new cookie; each refresh token works once. `logout` ends the current device's session, and `logoutEverywhere` ends every device's, cancelling access tokens already issued as well (each carries the user's `tokenVersion`, which signing out everywhere and changing or resetting a password raise). Changing or resetting a password signs out every other device.

`SameSite=Lax` only works when the app and the API share a site, so the front end has to reach `/graphql` through its own origin (a Netlify rewrite to this API in production, Vite's proxy in development) rather than calling this API's domain directly.

## Access

Every operation acts only on the signed-in user's own data. Ids that belong to someone else are refused with `FORBIDDEN`, the same as ids that don't exist, so the API never reveals which ids are real. The user operations take no id and always act on the caller. An account belongs to the user who created it (`Account.user`), and every record belongs to an account through its own `account` field, so access is checked by who owns that account. Creates and account-wide operations name the account with `input.accountId`; updates and deletes go by the record's id and use the account it's already in, so a record can never be moved to another account. `account` with no id gives the user's default account, the one set up first.

## Validation

Inputs are checked with Zod (`utils/validation`, one folder per topic) on top of the types GraphQL checks: email format, name and note lengths, amounts (under a billion, payments not negative) and real `YYYY-MM-DD` dates. A rejected input returns `BAD_USER_INPUT` with the field in `extensions.field`, except passwords (`INVALID_PASSWORD`) and accents (`INVALID_ACCENT`), which keep their own codes.

## Logging

Logs are JSON lines from [pino](https://getpino.io), which Render's log view can search. Unexpected errors are logged in full and the client only gets `Something went wrong`. Sign-ins, failed sign-ins, rejected session refreshes, password changes and resets, signing out everywhere, deleted users and rate limiting are logged with the user id and IP, never passwords, tokens or cookies. Locally, `npm start | npx pino-pretty` makes them readable.

## Rate limits

Login and password reset operations are limited per client IP (and per email where noted). Going over a limit returns HTTP 429 with a `TOO_MANY_REQUESTS` error that says how long to wait.

| Operation | Limit |
| --- | --- |
| `login` | 10 per 15 minutes per IP and email, and 50 per 15 minutes per IP |
| `requestPasswordReset` | 3 per hour per IP and email, and 10 per hour per IP |
| `refreshSession` | 60 per 15 minutes per IP |
| `resetPassword`, `passwordResetTokenValid` | 20 per 15 minutes per IP |

Counts are kept in memory, so they reset when the server restarts and aren't shared between several server instances. Add a shared store (such as Redis) if the API ever runs as more than one instance.

## Migrations

One-off scripts for data saved by older versions, in `scripts/`. They connect with `MONGODB_CONNECTION_STRING` and only report what they would change unless given `--apply`. Run them after this version is deployed.

- `npm run migrate:bills [-- --apply]` turns v1 bills into recurring payments: monthly expenses in `OTHER`, first due on the account's next payday, unpaid. Only accounts with bills and no recurring payments are touched, so it can be run again safely. The `bills` collection is left in place to check and then drop by hand.
- `npm run migrate:account-ids [-- --apply]` removes the `bills`, `notes`, `oneOffPayments`, `recurringPayments` and `payday` ids accounts used to store. Records are found through their own `account` field now, so these are ignored until removed.

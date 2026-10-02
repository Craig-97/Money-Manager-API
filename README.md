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
| `CLIENT_URL` | No | Front-end origin used in password reset links (default `http://localhost:5173`) |
| `SMTP_HOST` | No | SMTP server for outgoing email. When unset, emails are logged to the console instead of sent |
| `SMTP_PORT` | No | SMTP port (default `587`) |
| `SMTP_SECURE` | No | `true` to connect over TLS (usually with port `465`) |
| `SMTP_USER` / `SMTP_PASS` | No | SMTP credentials |
| `EMAIL_FROM` | No | Sender address (default `Money Manager <no-reply@moneymanager.app>`) |

## Rate limits

Login and password reset operations are limited per client IP (and per email where noted). Going over a limit returns HTTP 429 with a `TOO_MANY_REQUESTS` error that says how long to wait.

| Operation | Limit |
| --- | --- |
| `login` | 10 per 15 minutes per IP and email, and 50 per 15 minutes per IP |
| `requestPasswordReset` | 3 per hour per IP and email, and 10 per hour per IP |
| `resetPassword`, `passwordResetTokenValid` | 20 per 15 minutes per IP |

Counts are kept in memory, so they reset when the server restarts and aren't shared between several server instances. Add a shared store (such as Redis) if the API ever runs as more than one instance.

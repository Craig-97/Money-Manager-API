# Money-Manager-API
Backend API built for tracking finances using Node, Express JS, MongoDB and GraphQL

[See Front-end app here](https://github.com/Craig-97/Money-Manager)

## Running locally

Needs Node 24 or later and a MongoDB database to use as the dev copy.

1. `npm install`
2. Add a `.env` file with at least `MONGODB_DEV_CONNECTION_STRING` and `JWT_KEY` (see below)
3. `npm start` runs the API on `http://localhost:4000/graphql` and restarts it when files change

The front end's dev server sends `/graphql` here through its proxy, and its `npm run start:local` starts this API and the app together when both repos are cloned side by side. `npm test` runs the Jest tests, and `npm run typecheck` checks the types.

## Environment variables

| Variable | Required | Description |
| --- | --- | --- |
| `MONGODB_CONNECTION_STRING` | In production | The live database. Used when `NODE_ENV` is `production`, and by `--live` scripts |
| `MONGODB_DEV_CONNECTION_STRING` | Everywhere else | The dev database, used whenever `NODE_ENV` isn't `production`, so local runs never touch live data. There's no fall back: the API won't start without it |
| `NODE_ENV` | In production | Set to `production` on the live server: it picks the live database and secure cookies |
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
| `BANK_HOLIDAYS_URL` | No | Where the calendar feed reads UK bank holidays from, to place paydays (default gov.uk's `bank-holidays.json`). Set it empty to go without |

## Sessions

`login`, `registerAndLogin` and `resetPassword` return a short-lived access token (1 hour) for the client to keep in memory, and set a 30-day refresh token in an httpOnly `mm_refresh` cookie (`Secure` when `NODE_ENV=production`, `SameSite=Lax`, path `/graphql`). `refreshSession` swaps that cookie for a new access token and a new cookie; each refresh token works once. `logout` ends the current device's session, and `logoutEverywhere` ends every device's, cancelling access tokens already issued as well (each carries the user's `tokenVersion`, which signing out everywhere and changing or resetting a password raise). Changing or resetting a password signs out every other device.

`SameSite=Lax` only works when the app and the API share a site, so the front end has to reach `/graphql` through its own origin (a Netlify rewrite to this API in production, Vite's proxy in development) rather than calling this API's domain directly.

## Access

Every operation acts only on the signed-in user's own data. Ids that belong to someone else are refused with `FORBIDDEN`, the same as ids that don't exist, so the API never reveals which ids are real. The user operations take no id and always act on the caller. A budget belongs to the user who created it (`Budget.user`), and every record belongs to a budget through its own `budget` field, so access is checked by who owns that budget. Creates and budget-wide operations name the budget with `input.budgetId`; updates and deletes go by the record's id and use the budget it's already in, so a record can never be moved to another budget. `budget` with no id gives the user's default budget, the one set up first.

## Accounts

Money sits in a budget's accounts (`Account`): one spending account, made with the budget, where pay lands (`paidInto`), any other spending accounts, such as a joint one for bills, and any number of savings accounts. Balances are typed in, never linked to a bank. `Budget.bankBalance` is the accounts that count in free to spend, added up: the one pay lands in always does, other spending accounts do unless switched off, and savings only when switched on. Once a budget has more than one account to spend from, each recurring expense says which it goes out of (`account`); marking payments paid, payday and overpayments move that account. A recurring payment can pay into a savings account (`paysInto`), like a standing order: marking it paid adds its amount there too, and undoing takes it back off.

A savings account can earn interest (`interest`): an AER, and optionally how often it's paid (monthly, quarterly, yearly or at maturity) and on which day. With a frequency, interest is worked out on each day's closing balance and added on the day it's paid, kept in `interest.added` for the user to check against their bank. Without one, the rate is only shown.

Every change to an account's balance is kept as history: `AccountRecord`s for the opening balance, balances typed in and interest added, alongside the payment records that moved money in or out of it.

## Debts

A recurring expense can be paying off a debt (`RecurringPayment.debt`): what's left to pay, what was borrowed if known, and the APR. Interest builds up daily on the balance and is added when the next payment is marked paid, then the payment comes off. Each payment record keeps what it did to the debt (interest added, amount off, balance after), so undoing puts it back exactly. `logDebtOverpayment` pays extra off today: it's money out of the bank like any payment, comes straight off what's left, and can be taken back with `undoDebtOverpayment` in the same cycle.

## Reminders and the calendar feed

The app works reminders out itself from the payments, notes and payday, so the API only keeps what the user did with each one (`ReminderState`: read, cleared, or put away until a day), keyed by what it's about and the date it's for. Each budget has its usual reminder timing (`reminderSettings`), and each recurring payment can have its own timing for when it's due and when it renews.

`GET /cal/<token>.ics` is the budget's calendar feed: an iCalendar file of payments due, paydays, renewals, dated notes and, if chosen, debt-free dates, a month back and a year ahead, with alarms at 8:00 when each reminder is due. Calendar apps fetch it with nothing but the address, so the token is the only thing protecting it: it's random, turning the feed off or resetting it stops the old address working, and amounts are left out unless the user asks for them. The front end reaches it through its own origin, like `/graphql`. It's limited to 60 requests per 15 minutes per IP.

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

One-off scripts for data saved by older versions, in `scripts/`. They connect to the dev database unless given `--live`, say which one before they start, and only report what they would change unless given `--apply`. Try each on the dev copy first, then run them on live with `--live --apply` after this version is deployed.

`npm run db:copy [-- --apply] [--overwrite]` copies every collection in the live database, with its indexes, into the dev one, so the migrations can be tried on real data. It only reads from live. It won't write into a dev database that already has data unless given `--overwrite`, and it refuses if both connection strings lead to the same database.

- `npm run migrate:budget [-- --apply]` **runs first**: the others use its names. What holds a user's payday, income, payments and notes used to be called an account and is a budget now, so this renames the `accounts` collection to `budgets` and the `account` field on every linked record (users, notes, payments, payment records, payday, reminder states and bills) to `budget`. It drops the indexes on the old field and builds the new ones. Until it runs, nobody's budget is found. Safe to run again.
- `npm run migrate:accounts [-- --apply]` runs second. Budgets used to hold the bank balance; it lives on their accounts now, so this gives each budget without one a current account holding that balance, and takes the balance off the budget. Until it runs, those budgets' bank balance reads £0, and paying and payday fail with `CURRENT_ACCOUNT_MISSING`. Safe to run again.
- `npm run migrate:payment-accounts [-- --apply]` runs after `migrate:accounts`. Once a budget has more than one account to spend from, every recurring expense says which it goes out of. This records the ones that don't on the account pay lands in, which is where they've been going out of. Budgets with one account to spend from are left alone. Safe to run again.
- `npm run migrate:bills [-- --apply]` turns v1 bills into recurring payments: monthly expenses in `OTHER`, first due on the budget's next payday, unpaid. Only budgets with bills and no recurring payments are touched, so it can be run again safely. The `bills` collection is left in place to check and then drop by hand.
- `npm run migrate:payment-records [-- --apply]` moves each recurring payment's `handled` list (what was paid or skipped this cycle) into open payment records, then removes the list. Run it straight after deploying, as the API now reads paid and skipped dates from records; until then, payments show nothing paid this cycle. Safe to run again.
- `npm run migrate:renewal-reminders [-- --apply]` replaces each recurring payment's `renewalReminderDays` with the `dueReminder` and `renewalReminder` timings: 7, 14 or 30 days are kept, 0 on a payment with a renewal date stays off, and anything else follows the budget's usual timing. Run it straight after deploying; until then, renewals turned off by hand would remind again. Safe to run again.
- `npm run migrate:payment-categories [-- --apply]` moves payments to the one category list one-off and recurring payments now share, along with the copies their payment records keep, so history adds up under the new categories. Food is split by name into Eating out or Groceries, and income lands in an income category. Only categories not in the new list are changed, so it's safe to run again.
- `npm run migrate:account-interest [-- --apply]` runs after `migrate:accounts`. Savings accounts kept a rate that was only shown, as `interestRate`; it's part of `interest` now, which can also say when it's paid. The rate carries over with no schedule, so it's still only shown until the user says when it's paid. Safe to run again.
- `npm run migrate:account-history [-- --apply]` runs after `migrate:accounts`. It gives each account with no history an opening record at today's balance, so its history starts from today; earlier payment records don't count towards it, as the balances typed in back then weren't kept. Safe to run again.
- `npm run migrate:budget-ids [-- --apply]` removes the `bills`, `notes`, `oneOffPayments`, `recurringPayments` and `payday` ids budgets used to store. Records are found through their own `budget` field now, so these are ignored until removed.

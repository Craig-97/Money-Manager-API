import type { ClientSession } from "mongoose";
import type { Request } from "express";
import type {
  CreateAccountInput,
  UpdateAccountInput,
  MarkPaymentsPaidInput,
  MarkPaymentsUnpaidInput,
  SkipRecurringPaymentsInput,
  StartPaydayCycleInput,
} from "../../types/account/accountTypes";
import { PaymentType } from "../../constants/payment/paymentType";
import { PaymentOutcome } from "../../constants/payment/paymentOutcome";
import { checkAccountAccess, checkAuth } from "../../middleware/isAuth";
import { Account } from "../../models/account/Account";
import { User } from "../../models/user/User";
import { Note } from "../../models/note/Note";
import { OneOffPayment } from "../../models/payment/OneOffPayment";
import { Payday } from "../../models/payday/Payday";
import { RecurringPayment } from "../../models/payment/RecurringPayment";
import {
  USER_NOT_FOUND,
  ACCOUNT_NOT_FOUND,
  ACCOUNT_NOT_LINKED,
  ACCOUNT_EXISTS,
  ACCOUNT_UPDATE_FAILED,
  RECURRING_PAYMENT_NOT_FOUND,
  PAYMENT_NOT_FOUND,
  incrementVersion,
  withTransaction,
  validateUniqueName,
  parseInput,
  newAccount,
  accountInput,
  paydayCycle,
  skipRecurring,
} from "../../utils";
import {
  addDays,
  nextOccurrence,
  occurrencesBefore,
  ukDay,
} from "../../utils/dates";

type AccountDocument = InstanceType<typeof Account>;

// One of the signed-in user's accounts, or their default account when no id is given
const findAccount = async (
  _: unknown,
  { id }: { id?: string | null },
  req: Request,
) => {
  checkAuth(req);

  let accountId = id;
  if (accountId) {
    await checkAccountAccess(accountId, req);
  } else {
    const user = await User.findById(req.userId);
    if (!user) {
      throw USER_NOT_FOUND(req.userId);
    }
    // Setup isn't finished until the user has an account
    if (!user.account) {
      throw ACCOUNT_NOT_LINKED();
    }
    accountId = String(user.account);
  }

  const account = await Account.findById(accountId);
  if (!account) {
    throw ACCOUNT_NOT_FOUND(accountId);
  }
  return account;
};

// A new account for the signed-in user, with any payments and payday set up alongside it
const createAccount = async (
  _: unknown,
  { input }: { input: CreateAccountInput },
  req: Request,
) => {
  checkAuth(req);
  const {
    bankBalance,
    monthlyIncome,
    oneOffPayments = [],
    recurringPayments = [],
    payday,
  } = parseInput(newAccount, input);

  return withTransaction(async (session) => {
    const user = await User.findById(req.userId).session(session);
    if (!user) {
      throw USER_NOT_FOUND(req.userId);
    }

    // One account each for now
    const existingAccount = await Account.findOne({ user: user._id }).session(
      session,
    );
    if (existingAccount) {
      throw ACCOUNT_EXISTS(existingAccount.id);
    }

    const account = await new Account({
      bankBalance,
      monthlyIncome,
      user: user._id,
      // Setup starts the first cycle, so the payday prompt waits for the next payday
      cycleStartedOn: ukDay(),
    }).save({ session });

    // The account the app opens when it isn't given one
    user.account = account._id;
    await user.save({ session });

    // Check for name conflicts for all payments
    await Promise.all(
      [...oneOffPayments, ...recurringPayments].map((payment) =>
        validateUniqueName(payment.name, account._id, session),
      ),
    );

    await Promise.all([
      ...oneOffPayments.map((payment) =>
        new OneOffPayment({ ...payment, account: account._id }).save({
          session,
        }),
      ),
      ...recurringPayments.map((payment) =>
        new RecurringPayment({ ...payment, account: account._id }).save({
          session,
        }),
      ),
    ]);

    if (payday) {
      await new Payday({ ...payday, account: account._id }).save({ session });
    }

    return { account, success: true };
  });
};

const updateAccount = async (
  _: unknown,
  { id, input }: { id: string; input: UpdateAccountInput },
  req: Request,
) => {
  checkAuth(req);
  await checkAccountAccess(id, req);

  const { bankBalance, monthlyIncome } = parseInput(accountInput, input);
  // Check if neither bankBalance nor monthlyIncome is provided
  if (bankBalance === undefined && monthlyIncome === undefined) {
    throw ACCOUNT_UPDATE_FAILED();
  }

  const account = await Account.findById(id);
  if (!account) {
    throw ACCOUNT_NOT_FOUND(id);
  }

  // Only update fields that are provided
  if (bankBalance !== undefined) account.bankBalance = bankBalance;
  if (monthlyIncome !== undefined) account.monthlyIncome = monthlyIncome;

  incrementVersion(account);
  await account.save();

  return { account, success: true };
};

// Payday: sets the confirmed balance, moves the chosen recurring payments on from dates left over
// from the last cycle, and clears what was paid or skipped in it. Recording the payday stops the
// prompt showing again for it.
const startPaydayCycle = async (
  _: unknown,
  { input }: { input: StartPaydayCycleInput },
  req: Request,
) => {
  checkAuth(req);
  const { accountId, payday, bankBalance, recurringPaymentIds } = parseInput(
    paydayCycle,
    input,
  );
  await checkAccountAccess(accountId, req);

  return withTransaction(async (session) => {
    const account = await Account.findById(accountId).session(session);
    if (!account) {
      throw ACCOUNT_NOT_FOUND(accountId);
    }

    const cycleStart = new Date(payday);
    const payments = await RecurringPayment.find({ account: accountId }).session(
      session,
    );
    const chosen = new Set(recurringPaymentIds);
    for (const id of chosen) {
      if (!payments.some((payment) => payment.id === id)) {
        throw RECURRING_PAYMENT_NOT_FOUND(id);
      }
    }

    // Sequential: operations within a transaction session can't run in parallel
    for (const payment of payments) {
      // Done with once the cycle has ended. Anything already dealt with from payday on belongs to
      // the new cycle, so it stays and can still be undone.
      const handled = payment.handled.filter((entry) =>
        entry.dates.some((date) => date >= cycleStart),
      );
      // Its dates before payday weren't paid or skipped: the new cycle starts from its first date
      // from payday on
      const moves =
        chosen.has(payment.id) &&
        payment.nextDueDate &&
        payment.nextDueDate < cycleStart;
      if (handled.length === payment.handled.length && !moves) continue;

      payment.set("handled", handled);
      if (moves) payment.nextDueDate = nextOccurrence(payment, cycleStart);
      // Mongoose versions changes to handled itself; increment() joins in rather than clashing
      payment.increment();
      await payment.save({ session });
    }

    account.bankBalance = bankBalance;
    account.cycleStartedOn = cycleStart;
    incrementVersion(account);
    await account.save({ session });

    return { account, success: true };
  });
};

// What paying a payment does to the bank balance: money out comes off, money in goes on
const balanceChange = (payment: { amount: number; type: string }) =>
  payment.type === PaymentType.INCOME ? payment.amount : -payment.amount;

const roundPence = (amount: number) => Math.round(amount * 100) / 100;

type RecurringPaymentDocument = InstanceType<typeof RecurringPayment>;

/*
 * Pays, skips or undoes some of an account's recurring payments in one transaction. `change`
 * updates a payment and returns what it does to the balance, or null when it leaves it alone.
 */
const changeRecurringPayments = (
  accountId: string,
  recurringPaymentIds: string[],
  change: (payment: RecurringPaymentDocument) => number | null,
  // Further work in the same transaction, returning its own effect on the balance
  more?: (session: ClientSession) => Promise<number>,
) =>
  withTransaction(async (session) => {
    const account = await Account.findById(accountId).session(session);
    if (!account) {
      throw ACCOUNT_NOT_FOUND(accountId);
    }

    let balance = 0;
    // Sequential: operations within a transaction session can't run in parallel
    for (const id of recurringPaymentIds) {
      const payment = await RecurringPayment.findOne({
        _id: id,
        account: accountId,
      }).session(session);
      if (!payment) {
        throw RECURRING_PAYMENT_NOT_FOUND(id);
      }
      const effect = change(payment);
      if (effect === null) continue;
      balance += effect;
      payment.increment();
      await payment.save({ session });
    }

    if (more) balance += await more(session);

    account.bankBalance = roundPence((account.bankBalance ?? 0) + balance);
    incrementVersion(account);
    await account.save({ session });

    return { account, success: true };
  });

/*
 * Records some of a payment's dates as paid or skipped, moving it on to the date after the last.
 * Returns false when there's nothing to record.
 */
const handle = (
  payment: RecurringPaymentDocument,
  outcome: PaymentOutcome,
  dates: Date[],
) => {
  if (!dates.length) return false;
  payment.handled.push({ outcome, dates });
  payment.nextDueDate = nextOccurrence(payment, addDays(dates[dates.length - 1], 1));
  return true;
};

// Paying payments from the dashboard, as the bank balance sees it. A recurring payment has its
// next date paid and moves on to the one after; one-offs are done with, so they're deleted.
const markPaymentsPaid = async (
  _: unknown,
  { input }: { input: MarkPaymentsPaidInput },
  req: Request,
) => {
  checkAuth(req);
  const { accountId, recurringPaymentIds, oneOffPaymentIds } = input;
  await checkAccountAccess(accountId, req);

  return changeRecurringPayments(
    accountId,
    recurringPaymentIds,
    (payment) => {
      // Nothing to pay once it has ended
      if (!payment.nextDueDate) return null;
      handle(payment, PaymentOutcome.PAID, [payment.nextDueDate]);
      return balanceChange(payment);
    },
    async (session) => {
      let balance = 0;
      for (const id of oneOffPaymentIds) {
        const payment = await OneOffPayment.findOne({
          _id: id,
          account: accountId,
        }).session(session);
        if (!payment) {
          throw PAYMENT_NOT_FOUND(id);
        }
        balance += balanceChange(payment);
        await OneOffPayment.deleteOne({ _id: id }).session(session);
      }
      return balance;
    },
  );
};

// Undoes the latest pay or skip on each payment, bringing its dates back. A payment that was paid
// gets its amount back on the balance.
const markPaymentsUnpaid = async (
  _: unknown,
  { input }: { input: MarkPaymentsUnpaidInput },
  req: Request,
) => {
  checkAuth(req);
  const { accountId, recurringPaymentIds } = input;
  await checkAccountAccess(accountId, req);

  return changeRecurringPayments(accountId, recurringPaymentIds, (payment) => {
    const latest = payment.handled.pop();
    if (!latest) return null;
    payment.nextDueDate = latest.dates[0];
    return latest.outcome === PaymentOutcome.PAID ? -balanceChange(payment) : 0;
  });
};

// Leaves payments' dates unpaid without touching the balance: the next date, or every date before
// `until` (usually the next payday) to skip the rest of a cycle at once.
const skipRecurringPayments = async (
  _: unknown,
  { input }: { input: SkipRecurringPaymentsInput },
  req: Request,
) => {
  checkAuth(req);
  const { accountId, recurringPaymentIds, until } = parseInput(
    skipRecurring,
    input,
  );
  await checkAccountAccess(accountId, req);

  return changeRecurringPayments(accountId, recurringPaymentIds, (payment) => {
    const next = payment.nextDueDate;
    if (!next) return null;
    const dates = until
      ? occurrencesBefore(payment, next, new Date(until))
      : [next];
    return handle(payment, PaymentOutcome.SKIPPED, dates) ? 0 : null;
  });
};

const byAmount = { amount: 1 } as const;

// What's on an account is only loaded when a query asks for it. Each returns exec()'s promise
// rather than the query itself: Apollo calls then() more than once, and a query runs on each call.
const accountFields = {
  user: (account: AccountDocument) => User.findById(account.user).exec(),
  oneOffPayments: (account: AccountDocument) =>
    OneOffPayment.find({ account: account._id }).sort(byAmount).exec(),
  recurringPayments: (account: AccountDocument) =>
    RecurringPayment.find({ account: account._id }).sort(byAmount).exec(),
  notes: (account: AccountDocument) => Note.find({ account: account._id }).exec(),
  payday: (account: AccountDocument) => Payday.findOne({ account: account._id }).exec(),
};

// Export the resolvers
export const accountResolvers = {
  Query: {
    account: findAccount,
  },
  Mutation: {
    createAccount,
    updateAccount,
    startPaydayCycle,
    markPaymentsPaid,
    markPaymentsUnpaid,
    skipRecurringPayments,
  },
  Account: accountFields,
};

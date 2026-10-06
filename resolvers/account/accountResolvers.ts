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
import { PaymentStatus } from "../../constants/payment/paymentStatus";
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
} from "../../utils";
import { addDays, nextOccurrence, ukDay } from "../../utils/dates";

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

// Payday: sets the confirmed balance and moves the chosen recurring payments on to their next
// date as unpaid. Recording the payday stops the prompt showing again for it.
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

    const today = ukDay();
    const cycleStart = new Date(payday);
    // Sequential: operations within a transaction session can't run in parallel
    for (const id of recurringPaymentIds) {
      const payment = await RecurringPayment.findOne({
        _id: id,
        account: accountId,
      }).session(session);
      if (!payment) {
        throw RECURRING_PAYMENT_NOT_FOUND(id);
      }
      // Due on or after payday, so already part of the new cycle: moving it would skip a payment
      if (payment.nextDueDate && payment.nextDueDate >= cycleStart) continue;
      // The next date after the one just dealt with, and never one already in the past
      const after = payment.nextDueDate
        ? addDays(payment.nextDueDate, 1)
        : today;
      payment.nextDueDate = nextOccurrence(
        payment,
        after > today ? after : today,
      );
      payment.status = PaymentStatus.UNPAID;
      incrementVersion(payment);
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

/*
 * Changes the status of some of an account's recurring payments in one transaction. `change`
 * decides each payment's new status and what it does to the balance, or returns null to leave it.
 */
const changeRecurringStatus = (
  accountId: string,
  recurringPaymentIds: string[],
  change: (payment: InstanceType<typeof RecurringPayment>) => {
    status: PaymentStatus;
    balance: number;
  } | null,
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
      const next = change(payment);
      if (!next) continue;
      balance += next.balance;
      payment.status = next.status;
      incrementVersion(payment);
      await payment.save({ session });
    }

    if (more) balance += await more(session);

    account.bankBalance = roundPence((account.bankBalance ?? 0) + balance);
    incrementVersion(account);
    await account.save({ session });

    return { account, success: true };
  });

// Paying payments from the dashboard, as the bank balance sees it. Recurring payments stay listed
// as paid until the next cycle; one-offs are done with, so they're deleted.
const markPaymentsPaid = async (
  _: unknown,
  { input }: { input: MarkPaymentsPaidInput },
  req: Request,
) => {
  checkAuth(req);
  const { accountId, recurringPaymentIds, oneOffPaymentIds } = input;
  await checkAccountAccess(accountId, req);

  return changeRecurringStatus(
    accountId,
    recurringPaymentIds,
    // Already paid: its amount has already come off the balance
    (payment) =>
      payment.status === PaymentStatus.PAID
        ? null
        : { status: PaymentStatus.PAID, balance: balanceChange(payment) },
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

// Paid ones get their amounts back on the balance; skipped ones just go back to unpaid
const markPaymentsUnpaid = async (
  _: unknown,
  { input }: { input: MarkPaymentsUnpaidInput },
  req: Request,
) => {
  checkAuth(req);
  const { accountId, recurringPaymentIds } = input;
  await checkAccountAccess(accountId, req);

  return changeRecurringStatus(accountId, recurringPaymentIds, (payment) => {
    if (payment.status === PaymentStatus.PAID) {
      return { status: PaymentStatus.UNPAID, balance: -balanceChange(payment) };
    }
    if (payment.status === PaymentStatus.SKIPPED) {
      return { status: PaymentStatus.UNPAID, balance: 0 };
    }
    return null;
  });
};

// Leaves unpaid payments out of this cycle; the next cycle moves them on to their next date.
// Paid ones are left alone, as their amounts have already come off the balance.
const skipRecurringPayments = async (
  _: unknown,
  { input }: { input: SkipRecurringPaymentsInput },
  req: Request,
) => {
  checkAuth(req);
  const { accountId, recurringPaymentIds } = input;
  await checkAccountAccess(accountId, req);

  return changeRecurringStatus(accountId, recurringPaymentIds, (payment) =>
    payment.status === PaymentStatus.UNPAID
      ? { status: PaymentStatus.SKIPPED, balance: 0 }
      : null,
  );
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

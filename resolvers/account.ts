import type { Request } from 'express';
import type { CreateAccountInput, EditAccountInput, StartPaydayCycleInput } from '../types/account';
import { PaymentStatus } from '../constants/paymentStatus';
import { checkAccountAccess, checkAuth } from '../middleware/isAuth';
import { Account } from '../models/Account';
import { User } from '../models/User';
import { Bill } from '../models/Bill';
import { Note } from '../models/Note';
import { OneOffPayment } from '../models/OneOffPayment';
import { Payday } from '../models/Payday';
import { RecurringPayment } from '../models/RecurringPayment';
import {
  USER_NOT_FOUND,
  ACCOUNT_NOT_FOUND,
  ACCOUNT_NOT_LINKED,
  NO_ACCOUNTS,
  ACCOUNT_EXISTS,
  ACCOUNT_UPDATE_FAILED,
  RECURRING_PAYMENT_NOT_FOUND,
  incrementVersion,
  withTransaction,
  validateUniqueName
} from '../utils';
import { addDays, nextOccurrence, ukDay } from '../utils/dates';

// Helper function to validate user
const findUserById = async (userId: string) => {
  const user = await User.findById(userId);
  if (!user) {
    throw USER_NOT_FOUND(userId);
  }
  return user;
};

// Fetch all accounts
const findAccounts = async (_: unknown, _1: unknown, req: Request) => {
  checkAuth(req);
  const accounts = await Account.find();
  if (!accounts.length) {
    throw NO_ACCOUNTS();
  }
  return accounts;
};

// Fetch an account by user id
const findAccount = async (_: unknown, { id }: { id: string }, req: Request) => {
  checkAuth(req);
  const user = await findUserById(id);

  // Ensure user has an account linked
  if (!user.account) {
    throw ACCOUNT_NOT_LINKED();
  }

  const account = await Account.findById(user.account)
    .populate({ path: 'user' })
    .populate({ path: 'bills', options: { sort: { amount: 1 } } })
    .populate({ path: 'oneOffPayments', options: { sort: { amount: 1 } } })
    .populate({ path: 'recurringPayments', options: { sort: { amount: 1 } } })
    .populate({ path: 'notes' })
    .populate({ path: 'payday' });

  if (!account) {
    throw ACCOUNT_NOT_FOUND(user.account);
  }
  return account;
};

// Create a new account
const createAccount = async (_: unknown, { account }: { account: CreateAccountInput }, req: Request) => {
  checkAuth(req);

  return withTransaction(async session => {
    const {
      userId,
      bankBalance,
      monthlyIncome,
      bills = [],
      oneOffPayments = [],
      recurringPayments = [],
      payday
    } = account;
    const existingUser = await findUserById(userId);

    // Check if account already exists
    const existingAccount = await Account.findOne({ user: userId }).session(session);
    if (existingAccount) {
      throw ACCOUNT_EXISTS(existingAccount.id);
    }

    // Create the new account
    const newAccount = new Account({
      bankBalance,
      monthlyIncome,
      user: existingUser._id
    });
    await newAccount.save({ session });

    // Link the new account to the user
    existingUser.account = newAccount._id;
    await existingUser.save({ session });

    // Check for name conflicts for all bills and payments
    if (bills.length > 0 || oneOffPayments.length > 0 || recurringPayments.length > 0) {
      await Promise.all([
        ...bills.map(bill => validateUniqueName(bill.name, newAccount._id, session)),
        ...oneOffPayments.map(payment => validateUniqueName(payment.name, newAccount._id, session)),
        ...recurringPayments.map(payment =>
          validateUniqueName(payment.name, newAccount._id, session)
        )
      ]);
    }

    // Handle bills creation if provided
    if (bills.length > 0) {
      const createdBills = await Promise.all(
        bills.map(bill => new Bill({ ...bill, account: newAccount._id }).save({ session }))
      );
      newAccount.bills.push(...createdBills);
    }

    // Handle one-off payments creation if provided
    if (oneOffPayments.length > 0) {
      const createdPayments = await Promise.all(
        oneOffPayments.map(payment =>
          new OneOffPayment({ ...payment, account: newAccount._id }).save({ session })
        )
      );
      newAccount.oneOffPayments.push(...createdPayments);
    }

    // Handle recurring payments creation if provided
    if (recurringPayments.length > 0) {
      const createdRecurringPayments = await Promise.all(
        recurringPayments.map(payment =>
          new RecurringPayment({ ...payment, account: newAccount._id }).save({ session })
        )
      );
      newAccount.recurringPayments.push(...createdRecurringPayments);
    }

    // Handle payday creation if provided
    if (payday) {
      const newPayday = new Payday({
        ...payday,
        account: newAccount._id
      });
      await newPayday.save({ session });
      newAccount.payday = newPayday._id;
    }

    await newAccount.save({ session });

    // Fetch the fully populated account
    const populatedAccount = await Account.findById(newAccount._id)
      .populate('user')
      .populate('bills')
      .populate('oneOffPayments')
      .populate('recurringPayments')
      .populate('notes')
      .populate('payday')
      .session(session);

    return { account: populatedAccount, success: true };
  });
};

// Edit an account
const editAccount = async (_: unknown, { id, account }: { id: string; account: EditAccountInput }, req: Request) => {
  checkAuth(req);

  const { bankBalance, monthlyIncome } = account;
  const currentAccount = await Account.findById(id);

  if (!currentAccount) {
    throw ACCOUNT_NOT_FOUND(id);
  }

  // Check if neither bankBalance nor monthlyIncome is provided
  if (bankBalance === undefined && monthlyIncome === undefined) {
    throw ACCOUNT_UPDATE_FAILED();
  }

  // Only update fields that are provided
  if (bankBalance !== undefined) currentAccount.bankBalance = bankBalance;
  if (monthlyIncome !== undefined) currentAccount.monthlyIncome = monthlyIncome;

  incrementVersion(currentAccount);
  await currentAccount.save();

  return { account: currentAccount, success: true };
};

// Payday: sets the confirmed balance and moves the chosen recurring payments on to their next
// date as unpaid. Recording the payday stops the prompt showing again for it.
const startPaydayCycle = async (_: unknown, { input }: { input: StartPaydayCycleInput }, req: Request) => {
  checkAuth(req);
  const { accountId, payday, bankBalance, recurringPaymentIds } = input;
  await checkAccountAccess(accountId, req);

  return withTransaction(async session => {
    const account = await Account.findById(accountId).session(session);
    if (!account) {
      throw ACCOUNT_NOT_FOUND(accountId);
    }

    const today = ukDay();
    // Sequential: operations within a transaction session can't run in parallel
    for (const id of recurringPaymentIds) {
      const payment = await RecurringPayment.findOne({ _id: id, account: accountId }).session(session);
      if (!payment) {
        throw RECURRING_PAYMENT_NOT_FOUND(id);
      }
      // The next date after the one just dealt with, and never one already in the past
      const after = payment.nextDueDate ? addDays(payment.nextDueDate, 1) : today;
      payment.nextDueDate = nextOccurrence(payment, after > today ? after : today);
      payment.status = PaymentStatus.UNPAID;
      incrementVersion(payment);
      await payment.save({ session });
    }

    account.bankBalance = bankBalance;
    account.cycleStartedOn = new Date(payday);
    incrementVersion(account);
    await account.save({ session });

    const populatedAccount = await Account.findById(accountId)
      .populate({ path: 'oneOffPayments', options: { sort: { amount: 1 } } })
      .populate({ path: 'recurringPayments', options: { sort: { amount: 1 } } })
      .populate('payday')
      .session(session);

    return { account: populatedAccount, success: true };
  });
};

// Delete an account
const deleteAccount = async (_: unknown, { id }: { id: string }, req: Request) => {
  checkAuth(req);

  return withTransaction(async session => {
    const account = await Account.findById(id)
      .populate('user')
      .populate('bills')
      .populate('notes')
      .populate('oneOffPayments')
      .populate('recurringPayments')
      .populate('payday')
      .session(session);

    if (!account) {
      throw ACCOUNT_NOT_FOUND(id);
    }

    // Batch all delete operations into a single Promise.all
    await Promise.all(
      [
        account.user && User.deleteOne({ _id: account.user._id }).session(session),
        account.bills?.length > 0 &&
          Bill.deleteMany({
            _id: { $in: account.bills.map(bill => bill._id) }
          }).session(session),
        account.notes?.length > 0 &&
          Note.deleteMany({
            _id: { $in: account.notes.map(note => note._id) }
          }).session(session),
        account.oneOffPayments?.length > 0 &&
          OneOffPayment.deleteMany({
            _id: { $in: account.oneOffPayments.map(payment => payment._id) }
          }).session(session),
        account.recurringPayments?.length > 0 &&
          RecurringPayment.deleteMany({
            _id: { $in: account.recurringPayments.map(payment => payment._id) }
          }).session(session),
        account.payday && Payday.deleteOne({ _id: account.payday._id }).session(session),
        Account.deleteOne({ _id: id }).session(session)
      ].filter(Boolean)
    );

    return { success: true };
  });
};

// Export the resolvers
export const resolvers = {
  Query: {
    accounts: findAccounts,
    account: findAccount
  },
  Mutation: {
    createAccount,
    editAccount,
    deleteAccount,
    startPaydayCycle
  }
};

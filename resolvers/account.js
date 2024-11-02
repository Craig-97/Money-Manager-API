import { checkAuth } from '../middleware/isAuth';
import { Account } from '../models/Account';
import { User } from '../models/User';
import { Bill } from '../models/Bill';
import { OneOffPayment } from '../models/OneOffPayment';
import { Payday } from '../models/Payday';
import {
  USER_NOT_FOUND,
  ACCOUNT_NOT_FOUND,
  ACCOUNT_NOT_LINKED,
  NO_ACCOUNTS,
  ACCOUNT_EXISTS,
  ACCOUNT_UPDATE_FAILED,
  incrementVersion,
  withTransaction
} from '../utils';

// Helper function to validate user
const findUserById = async userId => {
  const user = await User.findById(userId);
  if (!user) {
    throw USER_NOT_FOUND(userId);
  }
  return user;
};

// Fetch all accounts
const findAccounts = async (_, _1, req) => {
  checkAuth(req);
  const accounts = await Account.find();
  if (!accounts.length) {
    throw NO_ACCOUNTS();
  }
  return accounts;
};

// Fetch an account by user id
const findAccount = async (_, { id }, req) => {
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
    .populate({ path: 'notes' })
    .populate({ path: 'payday' });

  if (!account) {
    throw ACCOUNT_NOT_FOUND(user.account);
  }
  return account;
};

// Create a new account
const createAccount = async (_, { account }, req) => {
  checkAuth(req);

  return withTransaction(async session => {
    const { userId, bankBalance, monthlyIncome, bills = [], oneOffPayments = [], payday } = account;
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
      .populate('notes')
      .populate('payday')
      .session(session);

    return { account: populatedAccount, success: true };
  });
};

// Edit an account
const editAccount = async (_, { id, account }, req) => {
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

// Delete an account
const deleteAccount = async (_, { id }, req) => {
  checkAuth(req);

  return withTransaction(async session => {
    const account = await Account.findById(id)
      .populate('user')
      .populate('bills')
      .populate('notes')
      .populate('oneOffPayments')
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
    deleteAccount
  }
};

import { checkAuth } from '../middleware/isAuth';
import { Account } from '../models/Account';
import { User } from '../models/User';
import { Bill } from '../models/Bill';
import { OneOffPayment } from '../models/OneOffPayment';
import { Payday } from '../models/Payday';
import { incrementVersion } from '../utils/documentHelpers';

// Helper function to validate user
const findUserById = async userId => {
  const user = await User.findById(userId);
  if (!user) {
    throw new Error(`User with ID '${userId}' does not exist`);
  }
  return user;
};

// Fetch all accounts
const findAccounts = async (_, _1, req) => {
  checkAuth(req);
  const accounts = await Account.find();
  if (!accounts.length) {
    throw new Error('No accounts exist');
  }
  return accounts;
};

// Fetch an account by user id
const findAccount = async (_, { id }, req) => {
  checkAuth(req);
  const user = await findUserById(id);

  // Ensure user has an account linked
  if (!user.account) {
    throw new Error('User does not have a linked account');
  }

  const account = await Account.findById(user.account)
    .populate({ path: 'user' })
    .populate({ path: 'bills', options: { sort: { amount: 1 } } })
    .populate({ path: 'oneOffPayments', options: { sort: { amount: 1 } } })
    .populate({ path: 'notes' })
    .populate({ path: 'payday' });

  if (!account) {
    throw new Error(`Account with id '${user.account}' does not exist`);
  }
  return account;
};

// Create a new account
const createAccount = async (_, { account }, req) => {
  checkAuth(req);

  const { userId, bankBalance, monthlyIncome, bills = [], oneOffPayments = [], payday } = account;
  const existingUser = await findUserById(userId);

  // Check if account already exists
  const existingAccount = await Account.findOne({ user: userId });
  if (existingAccount) {
    throw new Error(`Account with userId '${userId}' already exists`);
  }

  // Create the new account
  const newAccount = new Account({
    bankBalance,
    monthlyIncome,
    user: existingUser._id
  });

  await newAccount.save();

  // Link the new account to the user
  existingUser.account = newAccount._id;
  await existingUser.save();

  // Handle bills creation if provided
  if (bills.length > 0) {
    const createdBills = await Promise.all(
      bills.map(bill => new Bill({ ...bill, account: newAccount._id }).save())
    );
    newAccount.bills.push(...createdBills);
  }

  // Handle one-off payments creation if provided
  if (oneOffPayments.length > 0) {
    const createdPayments = await Promise.all(
      oneOffPayments.map(payment =>
        new OneOffPayment({ ...payment, account: newAccount._id }).save()
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
    await newPayday.save();
    newAccount.payday = newPayday._id;
  }

  await newAccount.save();

  // Fetch the fully populated account
  const populatedAccount = await Account.findById(newAccount._id)
    .populate('user')
    .populate('bills')
    .populate('oneOffPayments')
    .populate('notes')
    .populate('payday');

  return { account: populatedAccount, success: true };
};

// Edit an account
const editAccount = async (_, { id, account }, req) => {
  checkAuth(req);

  const { bankBalance, monthlyIncome } = account;
  const currentAccount = await Account.findById(id);

  if (!currentAccount) {
    throw new Error(`Account with id '${id}' does not exist`);
  }

  // Check if neither bankBalance nor monthlyIncome is provided
  if (bankBalance === undefined && monthlyIncome === undefined) {
    throw new Error(
      'No valid fields provided for update. Please provide at least one of: bankBalance, monthlyIncome.'
    );
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

  const account = await Account.findById(id)
    .populate('user')
    .populate('bills')
    .populate('notes')
    .populate('oneOffPayments')
    .populate('payday');

  if (!account) {
    throw new Error(`Account with id '${id}' does not exist`);
  }

  // Delete the user associated with the account
  if (account.user) {
    await User.deleteOne({ _id: account.user._id });
  }

  // Delete all bills linked to the account
  if (account.bills && account.bills.length > 0) {
    await Bill.deleteMany({ _id: { $in: account.bills.map(bill => bill._id) } });
  }

  // Delete all notes linked to the account
  if (account.notes && account.notes.length > 0) {
    await Note.deleteMany({ _id: { $in: account.notes.map(note => note._id) } });
  }

  // Delete all one-off payments linked to the account
  if (account.oneOffPayments && account.oneOffPayments.length > 0) {
    await OneOffPayment.deleteMany({
      _id: { $in: account.oneOffPayments.map(payment => payment._id) }
    });
  }

  // Delete the payday configuration if it exists
  if (account.payday) {
    await Payday.deleteOne({ _id: account.payday._id });
  }

  // Delete the account itself
  const response = await Account.deleteOne({ _id: id });
  if (response.deletedCount !== 1) {
    throw new Error('Account could not be deleted');
  }

  return { success: true };
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

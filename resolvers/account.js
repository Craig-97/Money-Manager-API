import { Account } from '../models/Account';

const findAccounts = async () => {
  const accounts = Account.find();
  if (!accounts) {
    throw new Error(`No accounts currently exist`);
  }
  return accounts;
};

const findAccount = async (_, { id }) => {
  const account = await Account.findById(id)
    .populate({ path: 'user' })
    .populate({ path: 'bills', options: { sort: { amount: 1 } } })
    .populate({ path: 'oneOffPayments', options: { sort: { amount: 1 } } })
    .populate({ path: 'notes' });

  if (!account) {
    throw new Error(`Account with id: ${id} does not exist`);
  }
  return account;
};

const createAccount = async (_, { account }) => {
  try {
    const existingAccount = await Account.findOne({ userId: account.userId });
    if (existingAccount) {
      throw new Error(`Account with userId: ${account.userId} already exists`);
    }
    const newAccount = new Account(account);
    await newAccount.save();
    return { account: newAccount, success: true };
  } catch (err) {
    throw err;
  }
};

const editAccount = async (_, { id, account }) => {
  try {
    const currentAccount = await Account.findById(id);
    if (!currentAccount) {
      throw new Error(`Account with id: ${id} does not exist`);
    }
    const mergedAccount = Object.assign(currentAccount, account);
    mergedAccount.__v = mergedAccount.__v + 1;

    const editedAccount = await Account.findOneAndUpdate({ _id: id }, mergedAccount, {
      new: true
    });

    if (editedAccount) {
      return {
        account: editedAccount,
        success: true
      };
    } else {
      throw new Error('Account cannot be updated');
    }
  } catch (err) {
    throw err;
  }
};

const deleteAccount = async (_, { id }) => {
  try {
    const account = await Account.findById(id);
    if (!account) {
      throw new Error(`Account with id: ${id} does not exist`);
    }

    const response = await Account.deleteOne({ _id: id });
    if (account && response.deletedCount == 1) {
      return {
        success: true
      };
    } else {
      throw new Error('Account cannot be deleted');
    }
  } catch (err) {
    throw err;
  }
};

exports.resolvers = {
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

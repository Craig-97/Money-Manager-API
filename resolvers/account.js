import { Account } from '../models/Account';
import { calculateAccountValues } from './utils';

const createAccount = async (_, { account }) => {
  try {
    let newAccount = calculateAccountValues(account);
    newAccount = new Account(newAccount);
    await newAccount.save();
    return { account: newAccount, success: true };
  } catch (err) {
    throw err;
  }
};

const editAccount = async (_, { id, account }) => {
  const currentAccount = await Account.findById(id);
  if (!currentAccount) {
    return {
      success: false
    };
  }
  const mergedAccount = Object.assign(currentAccount, account);
  mergedAccount.__v = mergedAccount.__v + 1;
  const calculatedAccount = calculateAccountValues(mergedAccount);

  try {
    const editedAccount = await Account.findOneAndUpdate({ _id: id }, calculatedAccount, {
      new: true
    });

    if (editedAccount) {
      return {
        account: editedAccount,
        success: true
      };
    } else {
      return {
        success: false
      };
    }
  } catch (err) {
    throw err;
  }
};

const deleteAccount = async (_, { id }) => {
  try {
    const response = await Account.deleteOne({ _id: id });
    if (response.ok && response.deletedCount == 1) {
      return {
        success: true
      };
    } else {
      return {
        success: false
      };
    }
  } catch (err) {
    throw err;
  }
};

exports.resolvers = {
  Query: {
    accounts: () => Account.find(),
    account: (_, { id }) =>
      Account.findById(id)
        .populate({ path: 'bills', options: { sort: { amount: 1 } } })
        .populate({ path: 'oneOffPayments', options: { sort: { amount: 1 } } })
        .populate({ path: 'notes' })
  },
  Mutation: {
    createAccount,
    editAccount,
    deleteAccount
  }
};
import { checkAuth, checkAccountAccess } from '../middleware/isAuth';
import { Account } from '../models/Account';
import { OneOffPayment } from '../models/OneOffPayment';
import { Bill } from '../models/Bill';
import { incrementVersion } from '../utils/documentHelpers';

const findOneOffPayments = async (_, { accountId }, req) => {
  await checkAuth(req);
  await checkAccountAccess(accountId, req);
  // Fetch the account associated with the authenticated user
  const userAccount = await Account.findOne({ _id: accountId });

  if (!userAccount) {
    throw new Error(`No account exists for user with ID '${accountId}'`);
  }
  const oneOffPayments = await OneOffPayment.find({ account: accountId }).sort({ amount: 1 });

  if (!oneOffPayments || oneOffPayments.length === 0) {
    throw new Error(`No one-off payments exist for account with ID '${accountId}'`);
  }

  return oneOffPayments;
};

const findOneOffPayment = async (_, { id }, req) => {
  await checkAuth(req);
  const oneOffPayment = await OneOffPayment.findById(id);
  if (!oneOffPayment) {
    throw new Error(`One-off payment with ID '${id}' does not exist`);
  }
  await checkAccountAccess(oneOffPayment.account, req);
  return oneOffPayment;
};

const createOneOffPayment = async (_, { oneOffPayment }, req) => {
  await checkAuth(req);
  await checkAccountAccess(oneOffPayment.account, req);

  // Check account exists first
  const account = await Account.findOne({ _id: oneOffPayment.account });
  if (!account) {
    throw new Error(`Account with ID '${oneOffPayment.account}' does not exist`);
  }

  const existingPayment = await OneOffPayment.findOne({
    name: oneOffPayment.name,
    account: oneOffPayment.account
  });
  if (existingPayment) {
    throw new Error(`Payment with name '${oneOffPayment.name}' already exists`);
  }

  const existingBill = await Bill.findOne({
    name: oneOffPayment.name,
    account: oneOffPayment.account
  });
  if (existingBill) {
    throw new Error(`Bill with name '${oneOffPayment.name}' already exists`);
  }

  const newOneOffPayment = new OneOffPayment(oneOffPayment);
  await newOneOffPayment.save();

  // Update account's oneOffPayments array
  account.oneOffPayments.push(newOneOffPayment);
  await account.save();

  return { oneOffPayment: newOneOffPayment, success: true };
};

const editOneOffPayment = async (_, { id, oneOffPayment }, req) => {
  await checkAuth(req);
  const currentOneOffPayment = await OneOffPayment.findById(id);
  if (!currentOneOffPayment) {
    throw new Error(`Payment with id '${id}' does not exist`);
  }
  await checkAccountAccess(currentOneOffPayment.account, req);

  try {
    const mergedOneOffPayment = incrementVersion(
      Object.assign(currentOneOffPayment, oneOffPayment)
    );

    const editedOneOffPayment = await OneOffPayment.findOneAndUpdate(
      { _id: id },
      mergedOneOffPayment,
      {
        new: true
      }
    );

    if (editedOneOffPayment) {
      return {
        oneOffPayment: editedOneOffPayment,
        success: true
      };
    } else {
      throw new Error('OneOffPayment cannot be updated');
    }
  } catch (err) {
    throw err;
  }
};

const deleteOneOffPayment = async (_, { id }, req) => {
  await checkAuth(req);
  const oneOffPayment = await OneOffPayment.findById(id);
  if (!oneOffPayment) {
    throw new Error(`Payment with id '${id}' does not exist`);
  }
  await checkAccountAccess(oneOffPayment.account, req);

  try {
    // Remove oneOffPayment reference from account
    const account = await Account.findOne({ oneOffPayments: oneOffPayment._id });
    if (account) {
      account.oneOffPayments.pull(oneOffPayment._id);
      await account.save();
    }

    const response = await OneOffPayment.deleteOne({ _id: id });
    if (oneOffPayment && response.deletedCount === 1) {
      return {
        oneOffPayment,
        success: true
      };
    } else {
      throw new Error('OneOffPayment cannot be deleted');
    }
  } catch (err) {
    throw err;
  }
};

const batchDeleteOneOffPayments = async (_, { ids }, req) => {
  await checkAuth(req);

  try {
    // Verify all payments exist and belong to the user's account
    const payments = await OneOffPayment.find({ _id: { $in: ids } });
    if (payments.length !== ids.length) {
      throw new Error('One or more payments not found');
    }

    // Check access for each payment
    await Promise.all(payments.map(payment => checkAccountAccess(payment.account, req)));

    // Delete all payments
    const result = await OneOffPayment.deleteMany({ _id: { $in: ids } });

    // Update account's oneOffPayments array
    const accountIds = [...new Set(payments.map(payment => payment.account))];
    await Account.updateMany(
      { _id: { $in: accountIds } },
      { $pull: { oneOffPayments: { $in: ids } } }
    );

    return {
      oneOffPayments: payments,
      success: true,
      deletedCount: result.deletedCount
    };
  } catch (err) {
    throw err;
  }
};

exports.resolvers = {
  Query: {
    oneOffPayments: findOneOffPayments,
    oneOffPayment: findOneOffPayment
  },
  Mutation: {
    createOneOffPayment,
    editOneOffPayment,
    deleteOneOffPayment,
    batchDeleteOneOffPayments
  }
};

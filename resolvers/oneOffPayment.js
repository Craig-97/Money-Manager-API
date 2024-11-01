import { checkAuth, checkAccountAccess } from '../middleware/isAuth';
import { Account } from '../models/Account';
import { OneOffPayment } from '../models/OneOffPayment';
import { Bill } from '../models/Bill';
import { incrementVersion } from '../utils/documentHelpers';
import { withTransaction } from '../utils/transactionHelpers';

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

  return withTransaction(async session => {
    // Check account exists first
    const account = await Account.findOne({ _id: oneOffPayment.account }).session(session);
    if (!account) {
      throw new Error(`Account with ID '${oneOffPayment.account}' does not exist`);
    }

    const existingPayment = await OneOffPayment.findOne({
      name: oneOffPayment.name,
      account: oneOffPayment.account
    }).session(session);
    if (existingPayment) {
      throw new Error(`Payment with name '${oneOffPayment.name}' already exists`);
    }

    const existingBill = await Bill.findOne({
      name: oneOffPayment.name,
      account: oneOffPayment.account
    }).session(session);
    if (existingBill) {
      throw new Error(`Bill with name '${oneOffPayment.name}' already exists`);
    }

    const newOneOffPayment = new OneOffPayment(oneOffPayment);
    await newOneOffPayment.save({ session });

    // Update account's oneOffPayments array
    account.oneOffPayments.push(newOneOffPayment);
    await account.save({ session });

    return { oneOffPayment: newOneOffPayment, success: true };
  });
};

const editOneOffPayment = async (_, { id, oneOffPayment }, req) => {
  await checkAuth(req);
  const currentOneOffPayment = await OneOffPayment.findById(id);
  if (!currentOneOffPayment) {
    throw new Error(`Payment with id '${id}' does not exist`);
  }
  await checkAccountAccess(currentOneOffPayment.account, req);

  const mergedOneOffPayment = incrementVersion(Object.assign(currentOneOffPayment, oneOffPayment));

  const editedOneOffPayment = await OneOffPayment.findOneAndUpdate(
    { _id: id },
    mergedOneOffPayment,
    {
      new: true
    }
  );

  if (!editedOneOffPayment) {
    throw new Error('OneOffPayment cannot be updated');
  }

  return {
    oneOffPayment: editedOneOffPayment,
    success: true
  };
};

const deleteOneOffPayment = async (_, { id }, req) => {
  await checkAuth(req);
  const oneOffPayment = await OneOffPayment.findById(id);
  if (!oneOffPayment) {
    throw new Error(`Payment with id '${id}' does not exist`);
  }
  await checkAccountAccess(oneOffPayment.account, req);

  return withTransaction(async session => {
    // Remove oneOffPayment reference from account
    const account = await Account.findOne({ oneOffPayments: oneOffPayment._id }).session(session);
    if (account) {
      account.oneOffPayments.pull(oneOffPayment._id);
      await account.save({ session });
    }

    const response = await OneOffPayment.deleteOne({ _id: id }).session(session);
    if (oneOffPayment && response.deletedCount === 1) {
      return {
        oneOffPayment,
        success: true
      };
    } else {
      throw new Error('OneOffPayment cannot be deleted');
    }
  });
};

const batchDeleteOneOffPayments = async (_, { ids }, req) => {
  await checkAuth(req);

  return withTransaction(async session => {
    // Verify all payments exist and belong to the user's account
    const payments = await OneOffPayment.find({ _id: { $in: ids } }).session(session);
    if (payments.length !== ids.length) {
      throw new Error('One or more payments not found');
    }

    // Check access for each payment
    await Promise.all(payments.map(payment => checkAccountAccess(payment.account, req)));

    // Delete all payments
    const result = await OneOffPayment.deleteMany({ _id: { $in: ids } }).session(session);

    // Update account's oneOffPayments array
    const accountIds = [...new Set(payments.map(payment => payment.account))];
    await Account.updateMany(
      { _id: { $in: accountIds } },
      { $pull: { oneOffPayments: { $in: ids } } }
    ).session(session);

    return {
      oneOffPayments: payments,
      success: true,
      deletedCount: result.deletedCount
    };
  });
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

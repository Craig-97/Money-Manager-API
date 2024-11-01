import { checkAuth, checkAccountAccess } from '../middleware/isAuth';
import { Account } from '../models/Account';
import { OneOffPayment } from '../models/OneOffPayment';
import { Bill } from '../models/Bill';

const findOneOffPayments = async (_, _1, req) => {
  await checkAuth(req);
  const oneOffPayments = await OneOffPayment.find({ account: req.accountId }).sort({ amount: 1 });
  if (!oneOffPayments) {
    throw new Error(`No oneOffPayments currently exist`);
  }
  return oneOffPayments;
};

const findOneOffPayment = async (_, { id }, req) => {
  await checkAuth(req);
  const oneOffPayment = await OneOffPayment.findById(id);
  if (!oneOffPayment) {
    throw new Error(`Payment with id '${id}' does not exist`);
  }
  await checkAccountAccess(oneOffPayment.account, req);
  return oneOffPayment;
};

const createOneOffPayment = async (_, { oneOffPayment }, req) => {
  await checkAuth(req);
  await checkAccountAccess(oneOffPayment.account, req);
  try {
    const existingPayment = await OneOffPayment.findOne({
      name: oneOffPayment.name,
      account: oneOffPayment.account
    });
    if (existingPayment) {
      throw new Error(`Payment '${oneOffPayment.name}' already exists`);
    }

    const existingBill = await Bill.findOne({
      name: oneOffPayment.name,
      account: oneOffPayment.account
    });
    if (existingBill) {
      throw new Error(`Bill '${oneOffPayment.name}' already exists`);
    }

    const newOneOffPayment = new OneOffPayment(oneOffPayment);
    await newOneOffPayment.save();

    // UPDATE ACCOUNT TO ONEOFFPAYMENTS ONE-TO-MANY LIST
    if (newOneOffPayment.account) {
      const account = await Account.findOne({ _id: newOneOffPayment.account });

      if (account) {
        account.oneOffPayments.push(newOneOffPayment);
        account.save();
      } else {
        throw new Error(`Account with ID ${newOneOffPayment.account} could not be found`);
      }
    }

    if (newOneOffPayment) {
      return { oneOffPayment: newOneOffPayment, success: true };
    } else {
      throw new Error(`OneOffPayment could not be created`);
    }
  } catch (err) {
    throw err;
  }
};

const editOneOffPayment = async (_, { id, oneOffPayment }, req) => {
  await checkAuth(req);
  const currentOneOffPayment = await OneOffPayment.findById(id);
  if (!currentOneOffPayment) {
    throw new Error(`Payment with id '${id}' does not exist`);
  }
  await checkAccountAccess(currentOneOffPayment.account, req);

  try {
    const mergedOneOffPayment = Object.assign(currentOneOffPayment, oneOffPayment);
    mergedOneOffPayment.__v = mergedOneOffPayment.__v + 1;

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
    const response = await OneOffPayment.deleteOne({ _id: id });
    if (oneOffPayment && response.deletedCount == 1) {
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

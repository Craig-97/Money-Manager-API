import { checkAuth, checkAccountAccess } from '../middleware/isAuth';
import { RecurringPayment } from '../models/RecurringPayment';
import { Account } from '../models/Account';
import {
  ACCOUNT_NOT_FOUND,
  RECURRING_PAYMENT_NOT_FOUND,
  RECURRING_PAYMENTS_NOT_FOUND,
  RECURRING_PAYMENT_EXISTS,
  RECURRING_PAYMENT_UPDATE_FAILED,
  RECURRING_PAYMENT_DELETE_FAILED,
  INVALID_RECURRING_PAYMENT_TYPE,
  withTransaction,
  validateUniqueName,
  incrementVersion
} from '../utils';

const findRecurringPayments = async (_, { accountId }, req) => {
  await checkAuth(req);
  await checkAccountAccess(accountId, req);
  const account = await Account.findById(accountId).populate('recurringPayments');
  if (!account) {
    throw ACCOUNT_NOT_FOUND(accountId);
  }
  const payments = await RecurringPayment.find({ account: accountId }).sort({ amount: 1 });

  if (!payments || payments.length === 0) {
    throw RECURRING_PAYMENTS_NOT_FOUND(accountId);
  }

  return payments;
};

const findRecurringPayment = async (_, { id }, req) => {
  await checkAuth(req);
  const payment = await RecurringPayment.findById(id).populate('account');
  if (!payment) {
    throw RECURRING_PAYMENT_NOT_FOUND(id);
  }
  await checkAccountAccess(payment.account, req);
  return payment;
};

const createRecurringPayment = async (_, { input }, req) => {
  await checkAuth(req);
  await checkAccountAccess(input.accountId, req);

  return withTransaction(async session => {
    const { accountId, name, type, ...paymentData } = input;

    const account = await Account.findById(accountId).session(session);
    if (!account) {
      throw ACCOUNT_NOT_FOUND(accountId);
    }

    // Validate payment type
    if (!['INCOME', 'EXPENSE'].includes(type)) {
      throw INVALID_RECURRING_PAYMENT_TYPE();
    }

    // Check if payment with same name exists
    await validateUniqueName(name, accountId, session);

    const newPayment = new RecurringPayment({
      ...paymentData,
      name,
      type,
      account: accountId
    });

    await newPayment.save({ session });

    account.recurringPayments.push(newPayment._id);
    await account.save({ session });

    const populatedPayment = await RecurringPayment.findById(newPayment._id)
      .populate('account')
      .session(session);

    return { recurringPayment: populatedPayment, success: true };
  });
};

const updateRecurringPayment = async (_, { id, input }, req) => {
  await checkAuth(req);
  const payment = await RecurringPayment.findById(id);
  if (!payment) {
    throw RECURRING_PAYMENT_NOT_FOUND(id);
  }
  await checkAccountAccess(payment.account, req);

  if (Object.keys(input).length === 0) {
    throw RECURRING_PAYMENT_UPDATE_FAILED();
  }

  if (input.type && !['INCOME', 'EXPENSE'].includes(input.type)) {
    throw INVALID_RECURRING_PAYMENT_TYPE();
  }

  if (input.name) {
    const existingPayment = await RecurringPayment.findOne({
      account: payment.account,
      name: input.name,
      _id: { $ne: id }
    });
    if (existingPayment) {
      throw RECURRING_PAYMENT_EXISTS(input.name);
    }
  }

  const mergedPayment = incrementVersion(Object.assign(payment, input));
  const updatedPayment = await RecurringPayment.findOneAndUpdate({ _id: id }, mergedPayment, {
    new: true
  });

  if (!updatedPayment) {
    throw RECURRING_PAYMENT_UPDATE_FAILED();
  }

  return { recurringPayment: updatedPayment, success: true };
};

const deleteRecurringPayment = async (_, { id }, req) => {
  await checkAuth(req);
  const payment = await RecurringPayment.findById(id);
  if (!payment) {
    throw RECURRING_PAYMENT_NOT_FOUND(id);
  }
  await checkAccountAccess(payment.account, req);

  return withTransaction(async session => {
    try {
      await Account.updateOne(
        { _id: payment.account },
        { $pull: { recurringPayments: payment._id } }
      ).session(session);

      await RecurringPayment.deleteOne({ _id: id }).session(session);
    } catch (error) {
      throw RECURRING_PAYMENT_DELETE_FAILED();
    }

    return { success: true };
  });
};

const batchUpdateRecurringPayments = async (_, { input }, req) => {
  await checkAuth(req);

  return withTransaction(async session => {
    // Operations within a transaction session must run sequentially, not in parallel
    const updates = [];
    for (const { id, ...updateData } of input) {
      const payment = await RecurringPayment.findById(id).session(session);
      if (!payment) {
        throw RECURRING_PAYMENT_NOT_FOUND(id);
      }
      await checkAccountAccess(payment.account, req);

      if (updateData.type && !['INCOME', 'EXPENSE'].includes(updateData.type)) {
        throw INVALID_RECURRING_PAYMENT_TYPE();
      }

      if (updateData.name) {
        const existingPayment = await RecurringPayment.findOne({
          account: payment.account,
          name: updateData.name,
          _id: { $ne: id }
        }).session(session);
        if (existingPayment) {
          throw RECURRING_PAYMENT_EXISTS(updateData.name);
        }
      }

      Object.assign(payment, updateData);
      incrementVersion(payment);
      await payment.save({ session });

      updates.push(payment);
    }

    const updatedPayments = await RecurringPayment.find({
      _id: { $in: updates.map(p => p._id) }
    })
      .populate('account')
      .session(session);

    return { recurringPayments: updatedPayments, success: true };
  });
};

const batchDeleteRecurringPayments = async (_, { ids }, req) => {
  await checkAuth(req);

  return withTransaction(async session => {
    // Verify all payments exist
    const payments = await RecurringPayment.find({ _id: { $in: ids } }).session(session);
    if (payments.length !== ids.length) {
      throw RECURRING_PAYMENTS_NOT_FOUND(ids);
    }

    // Check access for each payment
    await Promise.all(payments.map(payment => checkAccountAccess(payment.account, req)));

    try {
      // Delete all payments
      const result = await RecurringPayment.deleteMany({ _id: { $in: ids } }).session(session);

      if (result.deletedCount !== ids.length) {
        throw RECURRING_PAYMENT_DELETE_FAILED();
      }

      // Update accounts' recurringPayments arrays
      const accountIds = [...new Set(payments.map(payment => payment.account))];
      await Account.updateMany(
        { _id: { $in: accountIds } },
        { $pull: { recurringPayments: { $in: ids } } }
      ).session(session);

      return {
        recurringPayments: payments,
        success: true,
        deletedCount: result.deletedCount
      };
    } catch (error) {
      throw RECURRING_PAYMENT_DELETE_FAILED();
    }
  });
};

exports.resolvers = {
  Query: {
    recurringPayments: findRecurringPayments,
    recurringPayment: findRecurringPayment
  },
  Mutation: {
    createRecurringPayment,
    updateRecurringPayment,
    deleteRecurringPayment,
    batchUpdateRecurringPayments,
    batchDeleteRecurringPayments
  }
};

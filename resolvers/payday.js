import { checkAuth, checkAccountAccess } from '../middleware/isAuth';
import { Account } from '../models/Account';
import { Payday } from '../models/Payday';
import {
  ACCOUNT_NOT_FOUND,
  PAYDAY_NOT_FOUND,
  PAYDAYS_NOT_FOUND,
  PAYDAY_EXISTS,
  PAYDAY_UPDATE_FAILED,
  PAYDAY_DELETE_FAILED,
  withTransaction,
  incrementVersion
} from '../utils';

const findPaydays = async (_, _1, req) => {
  await checkAuth(req);
  const paydays = await Payday.find({ account: req.accountId });
  if (!paydays) {
    throw PAYDAYS_NOT_FOUND();
  }
  return paydays;
};

const findPayday = async (_, { id }, req) => {
  await checkAuth(req);
  const payday = await Payday.findById(id);
  if (!payday) {
    throw PAYDAY_NOT_FOUND(id);
  }
  await checkAccountAccess(payday.account, req);
  return payday;
};

const createPayday = async (_, { payday }, req) => {
  await checkAuth(req);
  await checkAccountAccess(payday.account, req);
  try {
    const existingPayday = await Payday.findOne({ account: payday.account });
    if (existingPayday) {
      throw PAYDAY_EXISTS();
    }

    const newPayday = new Payday(payday);
    await newPayday.save();

    // Update Account with payday reference
    if (newPayday.account) {
      const account = await Account.findOne({ _id: newPayday.account });
      if (account) {
        account.payday = newPayday;
        await account.save();
      } else {
        throw ACCOUNT_NOT_FOUND(newPayday.account);
      }
    }

    return { payday: newPayday, success: true };
  } catch (err) {
    throw err;
  }
};

const editPayday = async (_, { id, payday }, req) => {
  await checkAuth(req);
  const currentPayday = await Payday.findById(id);
  if (!currentPayday) {
    throw PAYDAY_NOT_FOUND(id);
  }
  await checkAccountAccess(currentPayday.account, req);

  const mergedPayday = incrementVersion(Object.assign(currentPayday, payday));

  const editedPayday = await Payday.findOneAndUpdate({ _id: id }, mergedPayday, {
    new: true
  });

  if (!editedPayday) {
    throw PAYDAY_UPDATE_FAILED();
  }

  return {
    payday: editedPayday,
    success: true
  };
};

const deletePayday = async (_, { id }, req) => {
  await checkAuth(req);
  const payday = await Payday.findById(id);
  if (!payday) {
    throw PAYDAY_NOT_FOUND(id);
  }
  await checkAccountAccess(payday.account, req);

  return withTransaction(async session => {
    // Remove payday reference from account
    const account = await Account.findOne({ payday: payday._id }).session(session);
    if (account) {
      account.payday = undefined;
      await account.save({ session });
    }

    const response = await Payday.deleteOne({ _id: id }).session(session);
    if (payday && response.deletedCount === 1) {
      return {
        payday,
        success: true
      };
    } else {
      throw PAYDAY_DELETE_FAILED();
    }
  });
};

exports.resolvers = {
  Query: {
    paydays: findPaydays,
    payday: findPayday
  },
  Mutation: {
    createPayday,
    editPayday,
    deletePayday
  }
};

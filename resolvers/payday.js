import { checkAuth, checkAccountAccess } from '../middleware/isAuth';
import { Account } from '../models/Account';
import { Payday } from '../models/Payday';

const findPaydays = async (_, _1, req) => {
  await checkAuth(req);
  const paydays = await Payday.find({ account: req.accountId });
  if (!paydays) {
    throw new Error('No paydays currently exist');
  }
  return paydays;
};

const findPayday = async (_, { id }, req) => {
  await checkAuth(req);
  const payday = await Payday.findById(id);
  if (!payday) {
    throw new Error(`Payday with id '${id}' does not exist`);
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
      throw new Error('Account already has a payday configuration');
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
        throw new Error(`Account with ID ${newPayday.account} could not be found`);
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
    throw new Error(`Payday with id '${id}' does not exist`);
  }
  await checkAccountAccess(currentPayday.account, req);

  try {
    const mergedPayday = Object.assign(currentPayday, payday);
    mergedPayday.__v = mergedPayday.__v + 1;

    const editedPayday = await Payday.findOneAndUpdate({ _id: id }, mergedPayday, {
      new: true
    });

    if (editedPayday) {
      return {
        payday: editedPayday,
        success: true
      };
    } else {
      throw new Error('Payday cannot be updated');
    }
  } catch (err) {
    throw err;
  }
};

const deletePayday = async (_, { id }, req) => {
  await checkAuth(req);
  const payday = await Payday.findById(id);
  if (!payday) {
    throw new Error(`Payday with id '${id}' does not exist`);
  }
  await checkAccountAccess(payday.account, req);

  try {
    // Remove payday reference from account
    const account = await Account.findOne({ payday: id });
    if (account) {
      account.payday = undefined;
      await account.save();
    }

    const response = await Payday.deleteOne({ _id: id });
    if (payday && response.deletedCount === 1) {
      return {
        payday,
        success: true
      };
    } else {
      throw new Error('Payday cannot be deleted');
    }
  } catch (err) {
    throw err;
  }
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

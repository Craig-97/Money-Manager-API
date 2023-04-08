import { checkAuth } from '../middleware/isAuth';
import { Account } from '../models/Account';
import { OneOffPayment } from '../models/OneOffPayment';
import { Bill } from '../models/Bill';

const findOneOffPayments = async (_, _1, req) => {
  checkAuth(req);
  const oneOffPayments = OneOffPayment.find().sort({ amount: 1 });
  if (!oneOffPayments) {
    throw new Error(`No oneOffPayments currently exist`);
  }
  return oneOffPayments;
};

const findOneOffPayment = async (_, { id }, req) => {
  checkAuth(req);
  const oneOffPayment = await OneOffPayment.findById(id);
  if (!oneOffPayment) {
    throw new Error(`OneOffPayment with id: ${id} does not exist`);
  }
  return oneOffPayment;
};

const createOneOffPayment = async (_, { oneOffPayment }, req) => {
  checkAuth(req);
  try {
    const existingPayment = await OneOffPayment.findOne({
      name: oneOffPayment.name,
      account: oneOffPayment.account
    });
    if (existingPayment) {
      throw new Error(`OneOffPayment with name: ${oneOffPayment.name} already exists`);
    }

    const existingBill = await Bill.findOne({
      name: oneOffPayment.name,
      account: oneOffPayment.account
    });
    if (existingBill) {
      throw new Error(`Bill with name: ${oneOffPayment.name} already exists`);
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
  checkAuth(req);
  try {
    const currentOneOffPayment = await OneOffPayment.findById(id);
    if (!currentOneOffPayment) {
      throw new Error(`OneOffPayment with id: ${id} does not exist`);
    }

    const mergedOneOffPayment = Object.assign(currentOneOffPayment, oneOffPayment);
    mergedOneOffPayment.__v = mergedOneOffPayment.__v + 1;

    const editedOneOffPayment = await OneOffPayment.findOneAndUpdate(
      { _id: id },
      mergedOneOffPayment,
      {
        new: true
      }
    );

    if (editOneOffPayment) {
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
  checkAuth(req);
  try {
    const oneOffPayment = await OneOffPayment.findById(id);
    if (!oneOffPayment) {
      throw new Error(`OneOffPayment with id: ${id} does not exist`);
    }

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

exports.resolvers = {
  Query: {
    oneOffPayments: findOneOffPayments,
    oneOffPayment: findOneOffPayment
  },
  Mutation: {
    createOneOffPayment,
    editOneOffPayment,
    deleteOneOffPayment
  }
};

import { OneOffPayment } from '../models/OneOffPayment';
import { Account } from '../models/Account';

const findOneOffPayments = async () => {
  const oneOffPayments = OneOffPayment.find().sort({ amount: 1 });
  if (!oneOffPayments) {
    throw new Error(`No oneOffPayments currently exist`);
  }
  return oneOffPayments;
};

const findOneOffPayment = async (_, { id }) => {
  const oneOffPayment = await OneOffPayment.findById(id);
  if (!oneOffPayment) {
    throw new Error(`OneOffPayment with id: ${id} does not exist`);
  }
  return oneOffPayment;
};

const createOneOffPayment = async (_, { oneOffPayment }) => {
  try {
    const existingPayment = await OneOffPayment.OneOffPayment({ name: oneOffPayment.name });
    if (existingPayment) {
      throw new Error(`OneOffPayment with name: ${oneOffPayment.name} already exists`);
    }

    const newOneOffPayment = new OneOffPayment(oneOffPayment);
    await newOneOffPayment.save().then(() => {
      // UPDATE ACCOUNT TO ONEOFFPAYMENTS ONE-TO-MANY LIST
      if (newOneOffPayment.account) {
        Account.findOne({ _id: newOneOffPayment.account }, (err, account) => {
          if (err) {
            throw err;
          }

          account.oneOffPayments.push(newOneOffPayment);
          account.save();
        });
      }
    });
    if (newOneOffPayment) {
      return { oneOffPayment: newOneOffPayment, success: true };
    } else {
      throw new Error(`OneOffPayment could not be created`);
    }
  } catch (err) {
    throw err;
  }
};

const editOneOffPayment = async (_, { id, oneOffPayment }) => {
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

const deleteOneOffPayment = async (_, { id }) => {
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

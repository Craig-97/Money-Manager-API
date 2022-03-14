import { OneOffPayment } from '../models/OneOffPayment';
import { Account } from '../models/Account';

const createOneOffPayment = async (_, { oneOffPayment }) => {
  try {
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
      return { success: false };
    }
  } catch (err) {
    throw err;
  }
};

const editOneOffPayment = async (_, { id, oneOffPayment }) => {
  const currentOneOffPayment = await OneOffPayment.findById(id);
  if (!currentOneOffPayment) {
    return {
      success: false
    };
  }

  const mergedOneOffPayment = Object.assign(currentOneOffPayment, oneOffPayment);
  mergedOneOffPayment.__v = mergedOneOffPayment.__v + 1;

  try {
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
      return {
        success: false
      };
    }
  } catch (err) {
    throw err;
  }
};

const deleteOneOffPayment = async (_, { id }) => {
  try {
    const oneOffPayment = await OneOffPayment.findById(id);
    const response = await OneOffPayment.deleteOne({ _id: id });
    if (response.ok && response.deletedCount == 1 && oneOffPayment) {
      return {
        oneOffPayment,
        success: true
      };
    } else {
      return {
        oneOffPayment,
        success: false
      };
    }
  } catch (err) {
    throw err;
  }
};

exports.resolvers = {
  Query: {
    oneOffPayments: () => OneOffPayment.find().sort({ amount: 1 }),
    oneOffPayment: (_, { id }) => OneOffPayment.findById(id)
  },
  Mutation: {
    createOneOffPayment,
    editOneOffPayment,
    deleteOneOffPayment
  }
};

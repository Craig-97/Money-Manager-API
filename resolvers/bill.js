import { Bill } from '../models/Bill';
import { Account } from '../models/Account';

const createBill = async (_, { bill }) => {
  try {
    const newBill = new Bill(bill);
    await newBill.save().then(() => {
      // UPDATE ACCOUNT TO BILL ONE-TO-MANY LIST
      if (newBill.account) {
        Account.findOne({ _id: newBill.account }, (err, account) => {
          if (err) {
            throw err;
          }

          account.bills.push(newBill);
          account.save();
        });
      }
    });

    if (newBill) {
      return { bill: newBill, success: true };
    } else {
      return { success: false };
    }
  } catch (err) {
    throw err;
  }
};

const editBill = async (_, { id, bill }) => {
  const currentBill = await Bill.findById(id);
  if (!currentBill) {
    return {
      success: false
    };
  }

  const mergedBill = Object.assign(currentBill, bill);
  mergedBill.__v = mergedBill.__v + 1;

  try {
    const editedBill = await Bill.findOneAndUpdate({ _id: id }, mergedBill, {
      new: true
    });

    if (editedBill) {
      return {
        bill: editedBill,
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

const deleteBill = async (_, { id }) => {
  try {
    const bill = await Bill.findById(id);
    const response = await Bill.deleteOne({ _id: id });

    if (bill && response.deletedCount == 1) {
      return {
        bill,
        success: true
      };
    } else {
      return {
        bill,
        success: false
      };
    }
  } catch (err) {
    throw err;
  }
};

exports.resolvers = {
  Query: {
    bills: async () => Bill.find().sort({ amount: 1 }),
    bill: async (_, { id }) => Bill.findById(id)
  },
  Mutation: {
    createBill,
    editBill,
    deleteBill
  }
};

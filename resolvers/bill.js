import { Bill } from '../models/Bill';
import { Account } from '../models/Account';

const findBills = async () => {
  const bills = Bill.find().sort({ amount: 1 });
  if (!bills) {
    throw new Error(`No bills currently exist`);
  }
  return bills;
};

const findBill = async (_, { id }) => {
  const bill = await Bill.findById(id);
  if (!bill) {
    throw new Error(`Bill with id: ${id} does not exist`);
  }
  return bill;
};

const createBill = async (_, { bill }) => {
  try {
    const existingBill = await Bill.findOne({ name: bill.name });
    if (existingBill) {
      throw new Error(`Bill with name: ${bill.name} already exists`);
    }

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
      throw new Error(`Bill could not be created`);
    }
  } catch (err) {
    throw err;
  }
};

const editBill = async (_, { id, bill }) => {
  try {
    const currentBill = await Bill.findById(id);
    if (!currentBill) {
      throw new Error(`Bill with id: ${id} does not exist`);
    }

    const mergedBill = Object.assign(currentBill, bill);
    mergedBill.__v = mergedBill.__v + 1;

    const editedBill = await Bill.findOneAndUpdate({ _id: id }, mergedBill, {
      new: true
    });

    if (editedBill) {
      return {
        bill: editedBill,
        success: true
      };
    } else {
      throw new Error('Bill cannot be updated');
    }
  } catch (err) {
    throw err;
  }
};

const deleteBill = async (_, { id }) => {
  try {
    const bill = await Bill.findById(id);
    if (!bill) {
      throw new Error(`Bill with id: ${id} does not exist`);
    }

    const response = await Bill.deleteOne({ _id: id });
    if (bill && response.deletedCount == 1) {
      return {
        bill,
        success: true
      };
    } else {
      throw new Error('Bill cannot be deleted');
    }
  } catch (err) {
    throw err;
  }
};

exports.resolvers = {
  Query: {
    bills: findBills,
    bill: findBill
  },
  Mutation: {
    createBill,
    editBill,
    deleteBill
  }
};

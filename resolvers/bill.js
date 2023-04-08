import { checkAuth } from '../middleware/isAuth';
import { Account } from '../models/Account';
import { OneOffPayment } from '../models/OneOffPayment';
import { Bill } from '../models/Bill';

const findBills = async (_, _1, req) => {
  checkAuth(req);
  const bills = Bill.find().sort({ amount: 1 });
  if (!bills) {
    throw new Error(`No bills currently exist`);
  }
  return bills;
};

const findBill = async (_, { id }, req) => {
  checkAuth(req);
  const bill = await Bill.findById(id);
  if (!bill) {
    throw new Error(`Bill with id: ${id} does not exist`);
  }
  return bill;
};

const createBill = async (_, { bill }, req) => {
  checkAuth(req);
  try {
    const existingBill = await Bill.findOne({ name: bill.name, account: bill.account });
    if (existingBill) {
      throw new Error(`Bill with name: ${bill.name} already exists`);
    }

    const existingPayment = await OneOffPayment.findOne({ name: bill.name, account: bill.account });
    if (existingPayment) {
      throw new Error(`OneOffPayment with name: ${bill.name} already exists`);
    }

    const newBill = new Bill(bill);
    await newBill.save();

    // UPDATE ACCOUNT TO BILL ONE-TO-MANY LIST
    if (newBill.account) {
      const account = await Account.findOne({ _id: newBill.account });

      if (account) {
        account.bills.push(newBill);
        account.save();
      } else {
        throw new Error(`Account with ID ${newBill.account} could not be found`);
      }
    }

    if (newBill) {
      return { bill: newBill, success: true };
    } else {
      throw new Error(`Bill could not be created`);
    }
  } catch (err) {
    throw err;
  }
};

const editBill = async (_, { id, bill }, req) => {
  checkAuth(req);
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

const deleteBill = async (_, { id }, req) => {
  checkAuth(req);
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

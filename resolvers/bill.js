import { checkAuth, checkAccountAccess } from '../middleware/isAuth';
import { Account } from '../models/Account';
import { Bill } from '../models/Bill';
import {
  ACCOUNT_NOT_FOUND,
  BILL_NOT_FOUND,
  BILLS_NOT_FOUND,
  BILL_UPDATE_FAILED,
  BILL_DELETE_FAILED,
  withTransaction,
  incrementVersion,
  validateUniqueName
} from '../utils';

const findBills = async (_, { accountId }, req) => {
  await checkAuth(req);
  await checkAccountAccess(accountId, req);

  // Fetch the account associated with the authenticated user
  const userAccount = await Account.findOne({ _id: accountId });

  if (!userAccount) {
    throw ACCOUNT_NOT_FOUND(accountId);
  }

  const bills = await Bill.find({ account: accountId }).sort({ amount: 1 });

  if (!bills || bills.length === 0) {
    throw BILLS_NOT_FOUND(accountId);
  }

  return bills;
};

const findBill = async (_, { id }, req) => {
  await checkAuth(req);
  const bill = await Bill.findById(id);
  if (!bill) {
    throw BILL_NOT_FOUND(id);
  }
  await checkAccountAccess(bill.account, req);
  return bill;
};

const createBill = async (_, { bill }, req) => {
  await checkAuth(req);
  await checkAccountAccess(bill.account, req);

  return withTransaction(async session => {
    // Check account exists first
    const account = await Account.findOne({ _id: bill.account }).session(session);
    if (!account) {
      throw ACCOUNT_NOT_FOUND(bill.account);
    }

    await validateUniqueName(bill.name, bill.account, session);

    const newBill = new Bill(bill);
    await newBill.save({ session });

    // Update account's bills array
    account.bills.push(newBill);
    await account.save({ session });

    return { bill: newBill, success: true };
  });
};

const editBill = async (_, { id, bill }, req) => {
  await checkAuth(req);
  const currentBill = await Bill.findById(id);
  if (!currentBill) {
    throw BILL_NOT_FOUND(id);
  }
  await checkAccountAccess(currentBill.account, req);

  const mergedBill = incrementVersion(Object.assign(currentBill, bill));

  const editedBill = await Bill.findOneAndUpdate({ _id: id }, mergedBill, { new: true });

  if (!editedBill) {
    throw BILL_UPDATE_FAILED();
  }

  return {
    bill: editedBill,
    success: true
  };
};

const deleteBill = async (_, { id }, req) => {
  await checkAuth(req);
  const bill = await Bill.findById(id);
  if (!bill) {
    throw BILL_NOT_FOUND(id);
  }
  await checkAccountAccess(bill.account, req);

  return withTransaction(async session => {
    // Remove bill reference from account
    const account = await Account.findOne({ bills: bill._id }).session(session);
    if (account) {
      account.bills.pull(bill._id);
      await account.save({ session });
    }

    const response = await Bill.deleteOne({ _id: id }).session(session);
    if (bill && response.deletedCount === 1) {
      return {
        bill,
        success: true
      };
    } else {
      throw BILL_DELETE_FAILED();
    }
  });
};

const batchUpdateBills = async (_, { input }, req) => {
  await checkAuth(req);
  const { ids, paid } = input;

  return withTransaction(async session => {
    // Verify all bills exist and belong to the user's account
    const bills = await Bill.find({ _id: { $in: ids } }).session(session);
    if (bills.length !== ids.length) {
      throw BILLS_NOT_FOUND();
    }

    // Check access for each bill
    await Promise.all(bills.map(bill => checkAccountAccess(bill.account, req)));

    // Update all bills
    const result = await Bill.updateMany(
      { _id: { $in: ids } },
      { $set: { paid }, $inc: { __v: 1 } }
    ).session(session);

    // Fetch updated bills
    const updatedBills = await Bill.find({ _id: { $in: ids } }).session(session);

    return {
      bills: updatedBills,
      success: true,
      updatedCount: result.modifiedCount
    };
  });
};

const batchDeleteBills = async (_, { ids }, req) => {
  await checkAuth(req);

  return withTransaction(async session => {
    // Verify all bills exist and belong to the user's account
    const bills = await Bill.find({ _id: { $in: ids } }).session(session);
    if (bills.length !== ids.length) {
      throw BILLS_NOT_FOUND();
    }

    // Check access for each bill
    await Promise.all(bills.map(bill => checkAccountAccess(bill.account, req)));

    // Delete all bills
    const result = await Bill.deleteMany({ _id: { $in: ids } }).session(session);

    // Update account's bills array
    const accountIds = [...new Set(bills.map(bill => bill.account))];
    await Account.updateMany(
      { _id: { $in: accountIds } },
      { $pull: { bills: { $in: ids } } }
    ).session(session);

    return {
      success: true,
      deletedCount: result.deletedCount
    };
  });
};

exports.resolvers = {
  Query: {
    bills: findBills,
    bill: findBill
  },
  Mutation: {
    createBill,
    editBill,
    deleteBill,
    batchUpdateBills,
    batchDeleteBills
  }
};

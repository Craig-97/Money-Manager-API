import { checkAuth, checkAccountAccess } from '../middleware/isAuth';
import { Account } from '../models/Account';
import { OneOffPayment } from '../models/OneOffPayment';
import { Bill } from '../models/Bill';

const findBills = async (_, { accountId }, req) => {
  await checkAuth(req);
  await checkAccountAccess(accountId, req);

  // Fetch the account associated with the authenticated user
  const userAccount = await Account.findOne({ id: accountId });

  if (!userAccount) {
    throw new Error(`No account found for user with ID '${accountId}'`);
  }

  // Fetch only the bills associated with the authenticated user's account
  const bills = await Bill.find({ account: userAccount._id }).sort({ amount: 1 });

  if (!bills || bills.length === 0) {
    throw new Error(`No bills currently exist for this account`);
  }

  return bills;
};

const findBill = async (_, { id }, req) => {
  await checkAuth(req);
  const bill = await Bill.findById(id);
  if (!bill) {
    throw new Error(`Bill with id '${id}' does not exist`);
  }
  await checkAccountAccess(bill.account, req);
  return bill;
};

const createBill = async (_, { bill }, req) => {
  await checkAuth(req);
  await checkAccountAccess(bill.account, req);

  try {
    const existingBill = await Bill.findOne({ name: bill.name, account: bill.account });
    if (existingBill) {
      throw new Error(`Bill '${bill.name}' already exists`);
    }

    const existingPayment = await OneOffPayment.findOne({ name: bill.name, account: bill.account });
    if (existingPayment) {
      throw new Error(`Payment '${bill.name}' already exists`);
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
  await checkAuth(req);
  const currentBill = await Bill.findById(id);
  if (!currentBill) {
    throw new Error(`Bill with id '${id}' does not exist`);
  }
  await checkAccountAccess(currentBill.account, req);

  try {
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
  await checkAuth(req);
  const bill = await Bill.findById(id);
  if (!bill) {
    throw new Error(`Bill with id '${id}' does not exist`);
  }
  await checkAccountAccess(bill.account, req);

  try {
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

const batchUpdateBills = async (_, { input }, req) => {
  await checkAuth(req);
  const { ids, paid } = input;

  try {
    // Verify all bills exist and belong to the user's account
    const bills = await Bill.find({ _id: { $in: ids } });
    if (bills.length !== ids.length) {
      throw new Error('One or more bills not found');
    }

    // Check access for each bill
    await Promise.all(bills.map(bill => checkAccountAccess(bill.account, req)));

    // Update all bills
    const result = await Bill.updateMany(
      { _id: { $in: ids } },
      { $set: { paid }, $inc: { __v: 1 } }
    );

    // Fetch updated bills
    const updatedBills = await Bill.find({ _id: { $in: ids } });

    return {
      bills: updatedBills,
      success: true,
      updatedCount: result.modifiedCount
    };
  } catch (err) {
    throw err;
  }
};

const batchDeleteBills = async (_, { ids }, req) => {
  await checkAuth(req);

  try {
    // Verify all bills exist and belong to the user's account
    const bills = await Bill.find({ _id: { $in: ids } });
    if (bills.length !== ids.length) {
      throw new Error('One or more bills not found');
    }

    // Check access for each bill
    await Promise.all(bills.map(bill => checkAccountAccess(bill.account, req)));

    // Delete all bills
    const result = await Bill.deleteMany({ _id: { $in: ids } });

    // Update account's bills array
    const accountIds = [...new Set(bills.map(bill => bill.account))];
    await Account.updateMany({ _id: { $in: accountIds } }, { $pull: { bills: { $in: ids } } });

    return {
      success: true,
      deletedCount: result.deletedCount
    };
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
    deleteBill,
    batchUpdateBills,
    batchDeleteBills
  }
};

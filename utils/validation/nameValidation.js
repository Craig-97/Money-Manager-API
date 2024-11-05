import { Bill } from '../../models/Bill';
import { OneOffPayment } from '../../models/OneOffPayment';
import { BILL_EXISTS, PAYMENT_EXISTS } from '../errors';

export const validateUniqueName = async (name, accountId, session, excludeId = null) => {
  // Check for existing payment with same name
  const existingPayment = await OneOffPayment.findOne({
    name,
    account: accountId,
    _id: { $ne: excludeId }
  }).session(session);

  if (existingPayment) {
    throw PAYMENT_EXISTS(name);
  }

  // Check for existing bill with same name
  const existingBill = await Bill.findOne({
    name,
    account: accountId,
    _id: { $ne: excludeId }
  }).session(session);

  if (existingBill) {
    throw BILL_EXISTS(name);
  }
};

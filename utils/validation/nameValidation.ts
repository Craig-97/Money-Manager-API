import type { ClientSession, Types } from 'mongoose';
import { Bill } from '../../models/Bill';
import { OneOffPayment } from '../../models/OneOffPayment';
import { RecurringPayment } from '../../models/RecurringPayment';
import { BILL_EXISTS, PAYMENT_EXISTS } from '../errors';

export const validateUniqueName = async (
  name: string,
  accountId: Types.ObjectId | string,
  session: ClientSession | null = null,
  excludeId: Types.ObjectId | string | null = null
) => {
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

  // Check for existing recurring payment with same name
  const existingRecurringPayment = await RecurringPayment.findOne({
    name,
    account: accountId,
    _id: { $ne: excludeId }
  }).session(session);

  if (existingRecurringPayment) {
    throw PAYMENT_EXISTS(name);
  }
};

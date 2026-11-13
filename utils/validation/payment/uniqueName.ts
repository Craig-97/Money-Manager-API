import type { ClientSession, Types } from 'mongoose';
import { OneOffPayment } from '../../../models/payment/OneOffPayment';
import { RecurringPayment } from '../../../models/payment/RecurringPayment';
import { PAYMENT_EXISTS } from '../../errors';

// No two payments in a budget, one-off or recurring, share a name. excludeId is the payment being
// renamed, which can keep its own.
export const validateUniqueName = async (
  name: string,
  {
    budgetId,
    session = null,
    excludeId = null
  }: {
    budgetId: Types.ObjectId | string;
    session?: ClientSession | null;
    excludeId?: Types.ObjectId | string | null;
  }
) => {
  // Check for existing payment with same name
  const existingPayment = await OneOffPayment.findOne({
    name,
    budget: budgetId,
    _id: { $ne: excludeId }
  }).session(session);

  if (existingPayment) {
    throw PAYMENT_EXISTS(name);
  }

  // Check for existing recurring payment with same name
  const existingRecurringPayment = await RecurringPayment.findOne({
    name,
    budget: budgetId,
    _id: { $ne: excludeId }
  }).session(session);

  if (existingRecurringPayment) {
    throw PAYMENT_EXISTS(name);
  }
};

import type { Request } from 'express';
import type { CreateOneOffPaymentInput, UpdateOneOffPaymentInput } from '../../types/payment/oneOffPaymentTypes';
import { PaymentType } from '../../constants/payment/paymentType';
import { enumValues } from '../../utils/helpers/enumHelpers';
import { checkAuth, checkBudgetAccess } from '../../middleware/isAuth';
import { OneOffPayment } from '../../models/payment/OneOffPayment';
import { PaymentRecord } from '../../models/payment/PaymentRecord';
import {
  PAYMENT_NOT_FOUND,
  PAYMENTS_NOT_FOUND,
  PAYMENT_UPDATE_FAILED,
  PAYMENT_DELETE_FAILED,
  INVALID_PAYMENT_TYPE,
  withTransaction,
  incrementVersion,
  validateUniqueName,
  parseInput,
  newOneOff,
  oneOffInput
} from '../../utils';

const createOneOffPayment = async (_: unknown, { input }: { input: CreateOneOffPaymentInput }, req: Request) => {
  checkAuth(req);
  const { budgetId, ...payment } = parseInput(newOneOff, input);
  await checkBudgetAccess(budgetId, req);

  // Validate type is either INCOME or EXPENSE
  if (!enumValues(PaymentType).includes(payment.type)) {
    throw INVALID_PAYMENT_TYPE();
  }

  return withTransaction(async session => {
    await validateUniqueName(payment.name, budgetId, session);

    const createdPayment = await new OneOffPayment({ ...payment, budget: budgetId }).save({ session });

    return { oneOffPayment: createdPayment, success: true };
  });
};

const updateOneOffPayment = async (
  _: unknown,
  { id, input }: { id: string; input: UpdateOneOffPaymentInput },
  req: Request
) => {
  checkAuth(req);
  const currentPayment = await OneOffPayment.findById(id);
  if (!currentPayment) {
    throw PAYMENT_NOT_FOUND(id);
  }
  await checkBudgetAccess(currentPayment.budget, req);
  input = parseInput(oneOffInput, input);

  const mergedPayment = incrementVersion(Object.assign(currentPayment, input));

  const updatedPayment = await OneOffPayment.findOneAndUpdate({ _id: id }, mergedPayment, {
    new: true
  });

  if (!updatedPayment) {
    throw PAYMENT_UPDATE_FAILED();
  }

  return { oneOffPayment: updatedPayment, success: true };
};

const batchDeleteOneOffPayments = async (_: unknown, { ids }: { ids: string[] }, req: Request) => {
  checkAuth(req);

  return withTransaction(async session => {
    // Verify all payments exist and belong to the user's budgets
    const payments = await OneOffPayment.find({ _id: { $in: ids } }).session(session);
    if (payments.length !== ids.length) {
      throw PAYMENTS_NOT_FOUND(ids);
    }
    for (const budget of new Set(payments.map(payment => String(payment.budget)))) {
      await checkBudgetAccess(budget, req);
    }

    const result = await OneOffPayment.deleteMany({ _id: { $in: ids } }).session(session);
    if (result.deletedCount !== ids.length) {
      throw PAYMENT_DELETE_FAILED();
    }
    // Deleting a one-off removes it completely, a paid one's record included
    await PaymentRecord.deleteMany({ oneOffPayment: { $in: ids } }).session(session);

    return { success: true, deletedCount: result.deletedCount, ids };
  });
};

export const oneOffPaymentResolvers = {
  Mutation: {
    createOneOffPayment,
    updateOneOffPayment,
    batchDeleteOneOffPayments
  }
};

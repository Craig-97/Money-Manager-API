import type { Request } from 'express';
import type { CreateOneOffPaymentInput, UpdateOneOffPaymentInput } from '../../types/payment/oneOffPaymentTypes';
import { PaymentType } from '../../constants/payment/paymentType';
import { enumValues } from '../../utils/helpers/enumHelpers';
import { checkAuth, checkAccountAccess } from '../../middleware/isAuth';
import { OneOffPayment } from '../../models/payment/OneOffPayment';
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
  const { accountId, ...payment } = parseInput(newOneOff, input);
  await checkAccountAccess(accountId, req);

  // Validate type is either INCOME or EXPENSE
  if (!enumValues(PaymentType).includes(payment.type)) {
    throw INVALID_PAYMENT_TYPE();
  }

  return withTransaction(async session => {
    await validateUniqueName(payment.name, accountId, session);

    const createdPayment = await new OneOffPayment({ ...payment, account: accountId }).save({ session });

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
  await checkAccountAccess(currentPayment.account, req);
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
    // Verify all payments exist and belong to the user's accounts
    const payments = await OneOffPayment.find({ _id: { $in: ids } }).session(session);
    if (payments.length !== ids.length) {
      throw PAYMENTS_NOT_FOUND(ids);
    }
    for (const account of new Set(payments.map(payment => String(payment.account)))) {
      await checkAccountAccess(account, req);
    }

    const result = await OneOffPayment.deleteMany({ _id: { $in: ids } }).session(session);
    if (result.deletedCount !== ids.length) {
      throw PAYMENT_DELETE_FAILED();
    }

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

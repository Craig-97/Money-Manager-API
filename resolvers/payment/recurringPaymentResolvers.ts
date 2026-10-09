import type { Request } from 'express';
import type { CreateRecurringPaymentInput, UpdateRecurringPaymentInput } from '../../types/payment/recurringPaymentTypes';
import { PaymentType } from '../../constants/payment/paymentType';
import { enumValues } from '../../utils/helpers/enumHelpers';
import { checkAuth, checkAccountAccess } from '../../middleware/isAuth';
import { RecurringPayment } from '../../models/payment/RecurringPayment';
import {
  RECURRING_PAYMENT_NOT_FOUND,
  RECURRING_PAYMENTS_NOT_FOUND,
  RECURRING_PAYMENT_EXISTS,
  RECURRING_PAYMENT_UPDATE_FAILED,
  RECURRING_PAYMENT_DELETE_FAILED,
  INVALID_RECURRING_PAYMENT_TYPE,
  withTransaction,
  validateUniqueName,
  parseInput,
  newRecurring,
  recurringInput,
  updatedRecurring
} from '../../utils';

const createRecurringPayment = async (_: unknown, { input }: { input: CreateRecurringPaymentInput }, req: Request) => {
  checkAuth(req);
  const { accountId, ...payment } = parseInput(newRecurring, input);
  await checkAccountAccess(accountId, req);

  // Validate payment type
  if (!enumValues(PaymentType).includes(payment.type)) {
    throw INVALID_RECURRING_PAYMENT_TYPE();
  }

  return withTransaction(async session => {
    // Check if payment with same name exists
    await validateUniqueName(payment.name, accountId, session);

    const createdPayment = await new RecurringPayment({ ...payment, account: accountId }).save({ session });

    return { recurringPayment: createdPayment, success: true };
  });
};

const updateRecurringPayment = async (
  _: unknown,
  { id, input }: { id: string; input: UpdateRecurringPaymentInput },
  req: Request
) => {
  checkAuth(req);
  const payment = await RecurringPayment.findById(id);
  if (!payment) {
    throw RECURRING_PAYMENT_NOT_FOUND(id);
  }
  await checkAccountAccess(payment.account, req);
  input = parseInput(recurringInput, input);

  if (Object.keys(input).length === 0) {
    throw RECURRING_PAYMENT_UPDATE_FAILED();
  }

  if (input.type && !enumValues(PaymentType).includes(input.type)) {
    throw INVALID_RECURRING_PAYMENT_TYPE();
  }

  if (input.name) {
    const existingPayment = await RecurringPayment.findOne({
      account: payment.account,
      name: input.name,
      _id: { $ne: id }
    });
    if (existingPayment) {
      throw RECURRING_PAYMENT_EXISTS(input.name);
    }
  }

  // The renewal rules span fields the update may leave alone, so they're checked on the result
  parseInput(updatedRecurring, { ...payment.toObject(), ...input });

  // save() rather than findOneAndUpdate, so the model works out the new due date when the
  // schedule changes
  // A schedule change clears handled, which Mongoose versions itself; increment() joins in
  Object.assign(payment, input).increment();
  await payment.save();

  return { recurringPayment: payment, success: true };
};

const batchDeleteRecurringPayments = async (_: unknown, { ids }: { ids: string[] }, req: Request) => {
  checkAuth(req);

  return withTransaction(async session => {
    // Verify all payments exist and belong to the user's accounts
    const payments = await RecurringPayment.find({ _id: { $in: ids } }).session(session);
    if (payments.length !== ids.length) {
      throw RECURRING_PAYMENTS_NOT_FOUND(ids);
    }
    for (const account of new Set(payments.map(payment => String(payment.account)))) {
      await checkAccountAccess(account, req);
    }

    const result = await RecurringPayment.deleteMany({ _id: { $in: ids } }).session(session);
    if (result.deletedCount !== ids.length) {
      throw RECURRING_PAYMENT_DELETE_FAILED();
    }

    return { success: true, deletedCount: result.deletedCount, ids };
  });
};

export const recurringPaymentResolvers = {
  Mutation: {
    createRecurringPayment,
    updateRecurringPayment,
    batchDeleteRecurringPayments
  }
};

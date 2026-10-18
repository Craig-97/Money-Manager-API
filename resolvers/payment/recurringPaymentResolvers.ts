import type { Request } from 'express';
import { isValidObjectId } from 'mongoose';
import type { CreateRecurringPaymentInput, UpdateRecurringPaymentInput } from '../../types/payment/recurringPaymentTypes';
import { PaymentType } from '../../constants/payment/paymentType';
import { enumValues } from '../../utils/helpers/enumHelpers';
import { checkAuth, checkAccountAccess } from '../../middleware/isAuth';
import { RecurringPayment } from '../../models/payment/RecurringPayment';
import { PaymentRecord } from '../../models/payment/PaymentRecord';
import { Note } from '../../models/note/Note';
import { latestOpenRecord, recordBalanceSet } from './paymentRecordResolvers';
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
  updatedRecurring,
  withBalanceDate
} from '../../utils';

const findRecurringPayment = async (_: unknown, { id }: { id: string }, req: Request) => {
  checkAuth(req);
  const payment = isValidObjectId(id) ? await RecurringPayment.findById(id) : null;
  if (!payment) {
    throw RECURRING_PAYMENT_NOT_FOUND(id);
  }
  await checkAccountAccess(payment.account, req);
  return payment;
};

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

    const createdPayment = await new RecurringPayment({
      ...payment,
      debt: withBalanceDate(payment.debt),
      account: accountId
    }).save({ session });
    if (createdPayment.debt) await recordBalanceSet(createdPayment, null, session);

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

  // An ended payment whose end moves carries on after the latest date it had dealt with
  if (input.lastPaymentDate !== undefined && !payment.nextDueDate) {
    payment.$locals.latestHandled = (await latestOpenRecord(payment._id))?.dates.at(-1);
  }

  return withTransaction(async session => {
    // A debt's balance only gets a new date, and a record, when it's actually set to something
    // else. null stops tracking it; its records stay as the payment's history.
    const { debt, ...fields } = input;
    const previous = payment.debt ? payment.debt.balance : null;
    const balanceSet = debt != null && previous !== debt.balance;
    if (debt === null) {
      payment.set('debt', undefined);
    } else if (debt) {
      payment.set(
        'debt',
        balanceSet ? withBalanceDate(debt) : { ...debt, balanceUpdatedAt: payment.debt?.balanceUpdatedAt }
      );
    }

    // save() rather than findOneAndUpdate, so the model works out the new due date when the
    // schedule changes, and closes the old schedule's records
    Object.assign(payment, fields).increment();
    await payment.save({ session });
    if (balanceSet) await recordBalanceSet(payment, previous, session);

    return { recurringPayment: payment, success: true };
  });
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
    // Deleting a payment takes its history with it. Notes about it stay, no longer linked.
    await PaymentRecord.deleteMany({ recurringPayment: { $in: ids } }).session(session);
    await Note.updateMany({ payment: { $in: ids } }, { $set: { payment: null } }).session(session);

    return { success: true, deletedCount: result.deletedCount, ids };
  });
};

export const recurringPaymentResolvers = {
  Query: {
    recurringPayment: findRecurringPayment
  },
  Mutation: {
    createRecurringPayment,
    updateRecurringPayment,
    batchDeleteRecurringPayments
  }
};

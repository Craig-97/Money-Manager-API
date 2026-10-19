import type { Request } from 'express';
import { isValidObjectId } from 'mongoose';
import type { CreateRecurringPaymentInput, UpdateRecurringPaymentInput } from '../../types/payment/recurringPaymentTypes';
import { PaymentType } from '../../constants/payment/paymentType';
import { enumValues } from '../../utils/helpers/enumHelpers';
import { checkAuth, checkBudgetAccess } from '../../middleware/isAuth';
import { RecurringPayment } from '../../models/payment/RecurringPayment';
import type { Types } from 'mongoose';
import { accountFields, checkPaymentAccounts } from '../account/accountResolvers';
import { PaymentRecord } from '../../models/payment/PaymentRecord';
import { Note } from '../../models/note/Note';
import { NoteRepeat } from '../../constants/note/noteRepeat';
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
  await checkBudgetAccess(payment.budget, req);
  return payment;
};

const createRecurringPayment = async (_: unknown, { input }: { input: CreateRecurringPaymentInput }, req: Request) => {
  checkAuth(req);
  const { budgetId, ...payment } = parseInput(newRecurring, input);
  await checkBudgetAccess(budgetId, req);

  // Validate payment type
  if (!enumValues(PaymentType).includes(payment.type)) {
    throw INVALID_RECURRING_PAYMENT_TYPE();
  }

  return withTransaction(async session => {
    // Check if payment with same name exists
    await validateUniqueName(payment.name, budgetId, session);
    await checkPaymentAccounts(payment, { budget: budgetId, session });

    const createdPayment = await new RecurringPayment({
      ...payment,
      debt: withBalanceDate(payment.debt),
      budget: budgetId
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
  await checkBudgetAccess(payment.budget, req);
  input = parseInput(recurringInput, input);

  if (Object.keys(input).length === 0) {
    throw RECURRING_PAYMENT_UPDATE_FAILED();
  }

  if (input.type && !enumValues(PaymentType).includes(input.type)) {
    throw INVALID_RECURRING_PAYMENT_TYPE();
  }

  if (input.name) {
    const existingPayment = await RecurringPayment.findOne({
      budget: payment.budget,
      name: input.name,
      _id: { $ne: id }
    });
    if (existingPayment) {
      throw RECURRING_PAYMENT_EXISTS(input.name);
    }
  }

  // The renewal rules span fields the update may leave alone, so they're checked on the result
  parseInput(updatedRecurring, { ...payment.toObject(), ...input });
  // As do the rules for its accounts: becoming income or a debt stops it moving money to another
  // account, and accounts it's newly given are checked
  const after = { ...payment.toObject(), ...input };
  if (input.paysInto === undefined && after.paysInto && (after.type !== PaymentType.EXPENSE || after.debt)) {
    input.paysInto = null;
    after.paysInto = null;
  }
  if (input.account !== undefined || input.paysInto || input.type !== undefined) {
    await checkPaymentAccounts(after, { budget: payment.budget });
  }

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
    // Verify all payments exist and belong to the user's budgets
    const payments = await RecurringPayment.find({ _id: { $in: ids } }).session(session);
    if (payments.length !== ids.length) {
      throw RECURRING_PAYMENTS_NOT_FOUND(ids);
    }
    for (const budget of new Set(payments.map(payment => String(payment.budget)))) {
      await checkBudgetAccess(budget, req);
    }

    const result = await RecurringPayment.deleteMany({ _id: { $in: ids } }).session(session);
    if (result.deletedCount !== ids.length) {
      throw RECURRING_PAYMENT_DELETE_FAILED();
    }
    // Deleting a payment takes its history with it. Notes about it stay, no longer linked; one that
    // followed its dates keeps the next one, once.
    await PaymentRecord.deleteMany({ recurringPayment: { $in: ids } }).session(session);
    for (const payment of payments) {
      await Note.updateMany(
        { payment: payment._id, repeat: NoteRepeat.WITH_PAYMENT },
        { $set: { repeat: NoteRepeat.NONE, date: payment.nextDueDate ?? null } }
      ).session(session);
    }
    await Note.updateMany({ payment: { $in: ids } }, { $set: { payment: null } }).session(session);

    return { success: true, deletedCount: result.deletedCount, ids };
  });
};

export const recurringPaymentResolvers = {
  Query: {
    recurringPayment: findRecurringPayment
  },
  RecurringPayment: {
    ...accountFields,
    paysInto: (payment: { paysInto?: Types.ObjectId | null }) =>
      payment.paysInto ? String(payment.paysInto) : null
  },
  PaymentRecordTransfer: {
    account: (transfer: { account: Types.ObjectId }) => String(transfer.account)
  },
  Mutation: {
    createRecurringPayment,
    updateRecurringPayment,
    batchDeleteRecurringPayments
  }
};

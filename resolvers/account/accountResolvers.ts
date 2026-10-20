import type { Request } from 'express';
import { isValidObjectId, type ClientSession, type Types } from 'mongoose';
import { AccountKind } from '../../constants/account/accountKind';
import { PaymentType } from '../../constants/payment/paymentType';
import { checkAuth, checkBudgetAccess } from '../../middleware/isAuth';
import { Account } from '../../models/account/Account';
import { Budget } from '../../models/budget/Budget';
import { OneOffPayment } from '../../models/payment/OneOffPayment';
import { RecurringPayment } from '../../models/payment/RecurringPayment';
import type {
  AssignPaymentAccountsInput,
  CreateAccountInput,
  UpdateAccountBalancesInput,
  UpdateAccountInput
} from '../../types/account/accountTypes';
import {
  ACCOUNT_NOT_ALLOWED,
  ACCOUNT_NOT_FOUND,
  BUDGET_NOT_FOUND,
  PAID_INTO_ACCOUNT_FIXED,
  PAID_INTO_ACCOUNT_MISSING,
  PAID_INTO_NOT_SPENDING,
  PAYS_INTO_NOT_ALLOWED,
  PAYS_INTO_SAME_ACCOUNT,
  RECURRING_PAYMENT_NOT_FOUND,
  accountBalances,
  accountInput,
  newAccount,
  parseInput,
  roundPence,
  withTransaction
} from '../../utils';

type AccountDocument = InstanceType<typeof Account>;
type BudgetId = Types.ObjectId | string;
type AccountId = Types.ObjectId | string;

/* The account in a budget that pay lands in. Payments that don't name an account use it too. */
export const paidIntoAccountOf = async (budget: BudgetId, session?: ClientSession) => {
  const account = await Account.findOne({ budget, paidInto: true }).session(session ?? null);
  if (!account) throw PAID_INTO_ACCOUNT_MISSING();
  return account;
};

/*
 * The account money goes out of or into for a payment: the one it names, while that's still in the
 * budget, else the one pay lands in
 */
export const accountFor = async (
  budget: BudgetId,
  { account, session }: { account?: AccountId | null; session?: ClientSession }
): Promise<Types.ObjectId> => {
  if (account) {
    const named = await Account.exists({ _id: account, budget }).session(session ?? null);
    if (named) return named._id;
  }
  return (await paidIntoAccountOf(budget, session))._id;
};

/*
 * Moves an account's balance by an amount: a payment out of or into it. The balance wasn't typed
 * in, so how old it is stays as it was. An account deleted since is left alone.
 */
export const moveMoney = async (
  account: AccountId,
  { amount, session }: { amount: number; session: ClientSession }
) => {
  if (!amount) return;
  const found = await Account.findById(account).session(session);
  if (!found) return;
  found.balance = roundPence(found.balance + amount);
  await found.save({ session });
};

/* Sets a balance the user typed in, dated now so the app can say how old it is */
export const setBalance = (account: AccountDocument, balance: number) => {
  account.balance = balance;
  account.balanceUpdatedAt = new Date();
};

// Where pay lands first, then the other spending accounts, then savings, each oldest first
const listOrder = (account: AccountDocument) =>
  account.paidInto ? 0 : account.kind === AccountKind.SPENDING ? 1 : 2;

export const accountsOf = async (budget: BudgetId, session?: ClientSession) =>
  (
    await Account.find({ budget })
      .sort({ createdAt: 1 })
      .session(session ?? null)
      .exec()
  ).toSorted((a, b) => listOrder(a) - listOrder(b));

/* The bank balance on the dashboard: the accounts that count in free to spend, added up */
export const countedBalance = async (budget: BudgetId) =>
  roundPence(
    (await Account.find({ budget, counts: true }).exec()).reduce(
      (total, account) => total + account.balance,
      0
    )
  );

/*
 * The accounts a payment names: an expense goes out of a spending account and an income can land in
 * any account. Moving money to another account is for an expense that isn't a debt, into a
 * different account from the one it goes out of.
 */
export const checkPaymentAccounts = async (
  payment: { type?: string; debt?: unknown; account?: unknown; paysInto?: unknown },
  { budget, session }: { budget: BudgetId; session?: ClientSession }
) => {
  const inBudget = async (id: unknown, field: 'account' | 'paysInto') => {
    const found = isValidObjectId(id)
      ? await Account.findOne({ _id: id, budget }).session(session ?? null)
      : null;
    if (!found) throw ACCOUNT_NOT_ALLOWED(id, field);
    return found;
  };
  if (payment.account) {
    const account = await inBudget(payment.account, 'account');
    if (payment.type === PaymentType.EXPENSE && account.kind !== AccountKind.SPENDING) {
      throw ACCOUNT_NOT_ALLOWED(payment.account, 'account');
    }
  }
  if (payment.paysInto) {
    if (payment.type !== PaymentType.EXPENSE || payment.debt) throw PAYS_INTO_NOT_ALLOWED();
    const into = await inBudget(payment.paysInto, 'paysInto');
    const from = await accountFor(budget, {
      account: payment.account as AccountId | null,
      session
    });
    if (into._id.equals(from)) throw PAYS_INTO_SAME_ACCOUNT();
  }
};

// An account the signed-in user can change: it has to be in one of their budgets
const findOwnAccount = async (id: string, req: Request) => {
  const account = isValidObjectId(id) ? await Account.findById(id) : null;
  if (!account) throw ACCOUNT_NOT_FOUND(id);
  await checkBudgetAccess(account.budget, req);
  return account;
};

const withBudget = async (account: AccountDocument | null, budgetId: BudgetId) => {
  const budget = await Budget.findById(budgetId);
  if (!budget) throw BUDGET_NOT_FOUND(budgetId);
  return { account, budget, success: true };
};

// A new account, savings unless it says otherwise. Spending money counts in free to spend and money
// put aside doesn't, unless the user says otherwise.
const createAccount = async (
  _: unknown,
  { input }: { input: CreateAccountInput },
  req: Request
) => {
  checkAuth(req);
  const { budgetId, name, kind, balance, counts, interestRate, purpose } = parseInput(
    newAccount,
    input
  );
  await checkBudgetAccess(budgetId, req);
  const spending = kind === AccountKind.SPENDING;

  const account = await new Account({
    budget: budgetId,
    name,
    kind: kind ?? AccountKind.SAVINGS,
    balance,
    counts: counts ?? spending,
    interestRate: interestRate ?? null,
    purpose: purpose ?? null,
    balanceUpdatedAt: new Date()
  }).save();
  return withBudget(account, budgetId);
};

/*
 * Only what's given changes. A balance that's set is dated now, even if it's the same figure: the
 * user has checked it. Making an account where pay lands moves that from the account it was, and it
 * always counts in free to spend. An account that becomes savings stops paying for expenses: they
 * go out of where pay lands instead.
 */
const updateAccount = async (
  _: unknown,
  { id, input }: { id: string; input: UpdateAccountInput },
  req: Request
) => {
  checkAuth(req);
  const account = await findOwnAccount(id, req);
  const { name, kind, balance, counts, paidInto, interestRate, purpose } = parseInput(
    accountInput,
    input
  );

  const nextKind = kind ?? account.kind;
  const spending = nextKind === AccountKind.SPENDING;
  if (account.paidInto && !spending) throw PAID_INTO_ACCOUNT_FIXED('made savings');
  if (paidInto && !spending) throw PAID_INTO_NOT_SPENDING();
  const paidIntoNext = account.paidInto || paidInto === true;
  if (paidIntoNext && counts === false) throw PAID_INTO_ACCOUNT_FIXED('kept out of free to spend');
  const becameSavings = account.kind === AccountKind.SPENDING && !spending;
  const becameSpending = account.kind !== AccountKind.SPENDING && spending;

  return withTransaction(async session => {
    if (name !== undefined) account.name = name;
    if (balance !== undefined) setBalance(account, balance);
    if (kind !== undefined) account.kind = kind;
    if (paidIntoNext) account.counts = true;
    else if (counts !== undefined) account.counts = counts;
    // Money to spend counts in free to spend and money put aside doesn't, unless the user says
    // otherwise
    else if (becameSavings) account.counts = false;
    else if (becameSpending) account.counts = true;
    if (interestRate !== undefined) account.interestRate = interestRate;
    if (purpose !== undefined) account.purpose = purpose;

    if (becameSavings) {
      await RecurringPayment.updateMany(
        { budget: account.budget, account: account._id, type: PaymentType.EXPENSE },
        { $set: { account: null } }
      ).session(session);
      await OneOffPayment.updateMany(
        { budget: account.budget, account: account._id, type: PaymentType.EXPENSE },
        { $set: { account: null } }
      ).session(session);
    }
    if (paidInto && !account.paidInto) {
      // Off the old one first: one account per budget is where pay lands
      await Account.updateMany(
        { budget: account.budget, paidInto: true },
        { $set: { paidInto: false } }
      ).session(session);
      account.paidInto = true;
    }
    await account.save({ session });
    const budget = await Budget.findById(account.budget).session(session);
    if (!budget) throw BUDGET_NOT_FOUND(account.budget);
    return { account, budget, success: true };
  });
};

// Deletes an account, never the one pay lands in. Payments that used it go out of, or into, where
// pay lands instead, and ones that moved money into it carry on as plain expenses.
const deleteAccount = async (_: unknown, { id }: { id: string }, req: Request) => {
  checkAuth(req);
  const account = await findOwnAccount(id, req);
  if (account.paidInto) throw PAID_INTO_ACCOUNT_FIXED('deleted');

  await withTransaction(async session => {
    const budget = account.budget;
    await RecurringPayment.updateMany(
      { budget, account: account._id },
      { $set: { account: null } }
    ).session(session);
    await RecurringPayment.updateMany(
      { budget, paysInto: account._id },
      { $set: { paysInto: null } }
    ).session(session);
    await OneOffPayment.updateMany(
      { budget, account: account._id },
      { $set: { account: null } }
    ).session(session);
    await Account.deleteOne({ _id: account._id }).session(session);
  });
  return withBudget(null, account.budget);
};

// Several balances at once, as typed in: the dashboard's bank balance when it's made of several
// accounts
const updateAccountBalances = async (
  _: unknown,
  { input }: { input: UpdateAccountBalancesInput },
  req: Request
) => {
  checkAuth(req);
  const { budgetId, balances } = parseInput(accountBalances, input);
  await checkBudgetAccess(budgetId, req);

  return withTransaction(async session => {
    await setBalances(budgetId, { balances, session });
    const budget = await Budget.findById(budgetId).session(session);
    if (!budget) throw BUDGET_NOT_FOUND(budgetId);
    return { budget, success: true };
  });
};

/*
 * Which account each of several recurring payments uses, set together: setting up accounts once
 * there's more than one to spend from. None goes back to the account pay lands in.
 */
const assignPaymentAccounts = async (
  _: unknown,
  { input }: { input: AssignPaymentAccountsInput },
  req: Request
) => {
  checkAuth(req);
  const { budgetId, payments } = input;
  await checkBudgetAccess(budgetId, req);

  return withTransaction(async session => {
    // Sequential: operations within a transaction session can't run in parallel
    for (const { recurringPaymentId, accountId } of payments) {
      const payment = isValidObjectId(recurringPaymentId)
        ? await RecurringPayment.findOne({ _id: recurringPaymentId, budget: budgetId }).session(
            session
          )
        : null;
      if (!payment) throw RECURRING_PAYMENT_NOT_FOUND(recurringPaymentId);
      const account = accountId ?? null;
      await checkPaymentAccounts(
        { type: payment.type, debt: payment.debt, account, paysInto: payment.paysInto },
        { budget: budgetId, session }
      );
      if (String(payment.account ?? null) === String(account)) continue;
      payment.set('account', account);
      payment.increment();
      await payment.save({ session });
    }
    const budget = await Budget.findById(budgetId).session(session);
    if (!budget) throw BUDGET_NOT_FOUND(budgetId);
    return { budget, success: true };
  });
};

/* Sets balances the user typed in on a budget's accounts; each has to be in that budget */
export const setBalances = async (
  budget: BudgetId,
  { balances, session }: { balances: { accountId: string; balance: number }[]; session: ClientSession }
) => {
  // Sequential: operations within a transaction session can't run in parallel
  for (const { accountId, balance } of balances) {
    const account = isValidObjectId(accountId)
      ? await Account.findOne({ _id: accountId, budget }).session(session)
      : null;
    if (!account) throw ACCOUNT_NOT_FOUND(accountId);
    setBalance(account, balance);
    await account.save({ session });
  }
};

// A payment's accounts as ids, or null for the one pay lands in
export const accountFields = {
  account: (payment: { account?: Types.ObjectId | null }) =>
    payment.account ? String(payment.account) : null
};

export const accountResolvers = {
  Mutation: {
    createAccount,
    updateAccount,
    deleteAccount,
    updateAccountBalances,
    assignPaymentAccounts
  }
};

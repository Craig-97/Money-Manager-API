import type { Request } from 'express';
import { isValidObjectId, type ClientSession, type Types } from 'mongoose';
import { AccountKind } from '../../constants/account/accountKind';
import { checkAuth, checkBudgetAccess } from '../../middleware/isAuth';
import { Account } from '../../models/account/Account';
import { Budget } from '../../models/budget/Budget';
import { RecurringPayment } from '../../models/payment/RecurringPayment';
import type {
  CreateAccountInput,
  UpdateAccountBalancesInput,
  UpdateAccountInput
} from '../../types/account/accountTypes';
import {
  ACCOUNT_NOT_FOUND,
  BUDGET_NOT_FOUND,
  CURRENT_ACCOUNT_FIXED,
  CURRENT_ACCOUNT_MISSING,
  accountBalances,
  accountInput,
  newAccount,
  parseInput,
  roundPence,
  withTransaction
} from '../../utils';

type AccountDocument = InstanceType<typeof Account>;
type BudgetId = Types.ObjectId | string;

/* A budget's current account, where pay lands and payments go out */
export const currentAccountOf = async (budget: BudgetId, session?: ClientSession) => {
  const account = await Account.findOne({ budget, kind: AccountKind.CURRENT }).session(
    session ?? null
  );
  if (!account) throw CURRENT_ACCOUNT_MISSING();
  return account;
};

/*
 * Moves an account's balance by an amount: a payment out of the current account, or into savings.
 * The balance wasn't typed in, so how old it is stays as it was. An account deleted since is left
 * alone.
 */
export const moveMoney = async (
  account: Types.ObjectId | string,
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

// A budget's accounts: the current account first, then savings, oldest first
export const accountsOf = async (budget: BudgetId, session?: ClientSession) =>
  (
    await Account.find({ budget })
      .sort({ createdAt: 1 })
      .session(session ?? null)
      .exec()
  ).toSorted(
    (a, b) => Number(b.kind === AccountKind.CURRENT) - Number(a.kind === AccountKind.CURRENT)
  );

/* The bank balance on the dashboard: the accounts that count in free to spend, added up */
export const countedBalance = async (budget: BudgetId) =>
  roundPence(
    (await Account.find({ budget, counts: true }).exec()).reduce(
      (total, account) => total + account.balance,
      0
    )
  );

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

// A new savings account. Phase 1 has one current account, made with the budget.
const createAccount = async (
  _: unknown,
  { input }: { input: CreateAccountInput },
  req: Request
) => {
  checkAuth(req);
  const { budgetId, name, balance, counts, interestRate, purpose } = parseInput(newAccount, input);
  await checkBudgetAccess(budgetId, req);

  const account = await new Account({
    budget: budgetId,
    name,
    kind: AccountKind.SAVINGS,
    balance,
    // Money put aside isn't money to spend, unless the user says it is
    counts: counts ?? false,
    interestRate: interestRate ?? null,
    purpose: purpose ?? null,
    balanceUpdatedAt: new Date()
  }).save();
  return withBudget(account, budgetId);
};

// Only what's given changes. A balance that's set is dated now, even if it's the same figure: the
// user has checked it.
const updateAccount = async (
  _: unknown,
  { id, input }: { id: string; input: UpdateAccountInput },
  req: Request
) => {
  checkAuth(req);
  const account = await findOwnAccount(id, req);
  const { name, balance, counts, interestRate, purpose } = parseInput(accountInput, input);

  if (account.kind === AccountKind.CURRENT && counts === false) {
    throw CURRENT_ACCOUNT_FIXED('kept out of free to spend');
  }
  if (name !== undefined) account.name = name;
  if (balance !== undefined) setBalance(account, balance);
  if (counts !== undefined) account.counts = counts;
  if (interestRate !== undefined) account.interestRate = interestRate;
  if (purpose !== undefined) account.purpose = purpose;
  await account.save();
  return withBudget(account, account.budget);
};

// Deletes a savings account. Payments that paid into it carry on as plain expenses.
const deleteAccount = async (_: unknown, { id }: { id: string }, req: Request) => {
  checkAuth(req);
  const account = await findOwnAccount(id, req);
  if (account.kind === AccountKind.CURRENT) throw CURRENT_ACCOUNT_FIXED('deleted');

  await withTransaction(async session => {
    await RecurringPayment.updateMany(
      { budget: account.budget, paysInto: account._id },
      { $set: { paysInto: null } }
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

export const accountResolvers = {
  Mutation: {
    createAccount,
    updateAccount,
    deleteAccount,
    updateAccountBalances
  }
};

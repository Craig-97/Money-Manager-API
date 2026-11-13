import type { Request } from 'express';
import { isValidObjectId, type ClientSession, type Types } from 'mongoose';
import { AccountKind } from '../../constants/account/accountKind';
import { InterestFrequency } from '../../constants/account/interestFrequency';
import { PaymentType } from '../../constants/payment/paymentType';
import { checkAuth, checkBudgetAccess } from '../../middleware/isAuth';
import { Account, type AccountInterest } from '../../models/account/Account';
import { Budget } from '../../models/budget/Budget';
import { OneOffPayment } from '../../models/payment/OneOffPayment';
import { RecurringPayment } from '../../models/payment/RecurringPayment';
import type {
  AccountInterestInput,
  AssignPaymentAccountsInput,
  CreateAccountInput,
  UpdateAccountBalancesInput,
  UpdateAccountInput
} from '../../types/account/accountTypes';
import { followingInterestDate, nextMonthlyDate } from '../../utils/dates/interest';
import { ukDay } from '../../utils/dates/recurrence';
import { accrueSavings, addDueInterest, savingsAccruedTo } from '../../utils/interest';
import {
  ACCOUNT_NOT_ALLOWED,
  ACCOUNT_NOT_FOUND,
  BUDGET_NOT_FOUND,
  INTEREST_DATE_PASSED,
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
  // Interest so far was earned on the balance before
  accrueSavings(found);
  found.balance = roundPence(found.balance + amount);
  await found.save({ session });
};

/*
 * The account an expense that names none is recorded on: where pay lands, once there's more than one
 * account to spend from. With only one, none needs naming, and they follow where pay lands.
 */
export const expenseAccountOf = async (budget: BudgetId, session?: ClientSession) => {
  const spending = await Account.find({ budget, kind: AccountKind.SPENDING }).session(session ?? null);
  return spending.length > 1 ? (spending.find(account => account.paidInto)?._id ?? null) : null;
};

/*
 * Once there's more than one account to spend from, every recurring expense says which: any that
 * don't are recorded on where pay lands, which is where they've been going out of. So none are ever
 * left without one.
 */
export const recordPaymentAccounts = async (budget: BudgetId, session: ClientSession) => {
  const account = await expenseAccountOf(budget, session);
  if (!account) return;
  await RecurringPayment.updateMany(
    { budget, type: PaymentType.EXPENSE, account: null },
    { $set: { account } }
  ).session(session);
};

/*
 * Payments that name an account that's going, or an expense whose account becomes savings: they
 * move to where pay lands, by name while there's still more than one to spend from
 */
const moveOffAccount = async (
  account: AccountDocument,
  { expenses, session }: { expenses: boolean; session: ClientSession }
) => {
  const filter = {
    budget: account.budget,
    account: account._id,
    ...(expenses ? { type: PaymentType.EXPENSE } : {})
  };
  const to = await expenseAccountOf(account.budget, session);
  await RecurringPayment.updateMany(filter, { $set: { account: to } }).session(session);
  await OneOffPayment.updateMany(filter, { $set: { account: to } }).session(session);
};

/* Sets a balance the user typed in, dated now so the app can say how old it is */
export const setBalance = (account: AccountDocument, balance: number) => {
  // Interest so far was earned on the balance before. It isn't paid yet, so it carries on.
  accrueSavings(account);
  account.balance = balance;
  // Checked against the bank, so interest the app added has been too
  if (account.interest) account.interest.added = [];
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

/*
 * Interest as it's kept: a monthly payment's next date from its day, the others' from the date
 * given, which has to be after today. Only savings earn it. A new one counts from today.
 */
export const interestOf = (
  input: AccountInterestInput | null | undefined,
  { savings }: { savings: boolean }
) => {
  if (!input || !savings) return null;
  const { rate, frequency } = input;
  const today = ukDay();
  const fresh = { accrued: 0, accruedTo: frequency ? today : null };
  if (!frequency) return { rate, frequency: null, day: null, nextDate: null, ...fresh };
  if (frequency === InterestFrequency.MONTHLY) {
    const day = input.day!;
    return { rate, frequency, day, nextDate: nextMonthlyDate(day, today), ...fresh };
  }
  const nextDate = new Date(`${input.nextDate!.slice(0, 10)}T00:00:00Z`);
  if (nextDate <= today) throw INTEREST_DATE_PASSED();
  return { rate, frequency, day: nextDate.getUTCDate(), nextDate, ...fresh };
};

const withBudget = async (account: AccountDocument | null, budgetId: BudgetId) => {
  const budget = await Budget.findById(budgetId);
  if (!budget) throw BUDGET_NOT_FOUND(budgetId);
  return { account, budget, success: true };
};

// A new account, savings unless it says otherwise. Spending money counts in free to spend and money
// put aside doesn't, unless the user says otherwise. A spending account can be made where pay lands,
// moving that from the account it was, and then it always counts.
const createAccount = async (
  _: unknown,
  { input }: { input: CreateAccountInput },
  req: Request
) => {
  checkAuth(req);
  const { budgetId, name, kind, balance, counts, paidInto, interest, purpose } = parseInput(
    newAccount,
    input
  );
  await checkBudgetAccess(budgetId, req);
  const spending = kind === AccountKind.SPENDING;
  if (paidInto && !spending) throw PAID_INTO_NOT_SPENDING();
  if (paidInto && counts === false) throw PAID_INTO_ACCOUNT_FIXED('kept out of free to spend');

  const account = new Account({
    budget: budgetId,
    name,
    kind: kind ?? AccountKind.SAVINGS,
    balance,
    counts: paidInto ? true : (counts ?? spending),
    interest: interestOf(interest, { savings: (kind ?? AccountKind.SAVINGS) === AccountKind.SAVINGS }),
    purpose: purpose ?? null,
    balanceUpdatedAt: new Date()
  });
  if (!spending) return withBudget(await account.save(), budgetId);

  // Another account to spend from: payments that don't say which they go out of are recorded on
  // where pay lands, once that's settled
  return withTransaction(async session => {
    if (paidInto) {
      // Off the old one first: one account per budget is where pay lands
      await Account.updateMany(
        { budget: budgetId, paidInto: true },
        { $set: { paidInto: false } }
      ).session(session);
      account.paidInto = true;
    }
    await account.save({ session });
    await recordPaymentAccounts(budgetId, session);
    const budget = await Budget.findById(budgetId).session(session);
    if (!budget) throw BUDGET_NOT_FOUND(budgetId);
    return { account, budget, success: true };
  });
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
  const { name, kind, balance, counts, paidInto, interest, purpose } = parseInput(
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
    // What's built up so far is counted at the balance and rate from before
    accrueSavings(account);
    const builtUp = account.interest?.frequency
      ? { accrued: account.interest.accrued ?? 0, accruedTo: account.interest.accruedTo ?? null }
      : null;
    if (name !== undefined) account.name = name;
    if (balance !== undefined) setBalance(account, balance);
    if (kind !== undefined) account.kind = kind;
    if (paidIntoNext) account.counts = true;
    else if (counts !== undefined) account.counts = counts;
    // Money to spend counts in free to spend and money put aside doesn't, unless the user says
    // otherwise
    else if (becameSavings) account.counts = false;
    else if (becameSpending) account.counts = true;
    // Only savings earn interest, so an account that becomes one to spend from stops
    if (interest !== undefined) {
      const next = interestOf(interest, { savings: !spending });
      // A new rate, day or frequency carries on from what's built up, which is still to be paid
      account.interest = next?.frequency && builtUp ? { ...next, ...builtUp } : next;
    } else if (becameSpending) account.interest = null;
    if (purpose !== undefined) account.purpose = purpose;

    if (paidInto && !account.paidInto) {
      // Off the old one first: one account per budget is where pay lands
      await Account.updateMany(
        { budget: account.budget, paidInto: true },
        { $set: { paidInto: false } }
      ).session(session);
      account.paidInto = true;
    }
    // Saved first, so the accounts left to spend from are counted as they are now
    await account.save({ session });
    if (becameSavings) await moveOffAccount(account, { expenses: true, session });
    if (becameSpending) await recordPaymentAccounts(account.budget, session);
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
    await RecurringPayment.updateMany(
      { budget: account.budget, paysInto: account._id },
      { $set: { paysInto: null } }
    ).session(session);
    // Deleted first, so the accounts left to spend from are counted without it
    await Account.deleteOne({ _id: account._id }).session(session);
    await moveOffAccount(account, { expenses: false, session });
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

/*
 * Adds savings interest that's come since the app was last opened, on each payment's own date, so
 * nobody has to. It isn't a balance the user typed in, so how old the balance is stays as it was.
 * Each account is written only if its next date is still the one read, so two tabs opening at once
 * can't add it twice.
 */
const catchUpInterest = async (_: unknown, { budgetId }: { budgetId: string }, req: Request) => {
  checkAuth(req);
  await checkBudgetAccess(budgetId, req);
  const today = ukDay();
  const due = await Account.find({ budget: budgetId, 'interest.nextDate': { $lte: today } });
  // Sequential, so each write is checked against what was read for it
  for (const account of due) {
    const was = account.interest!.nextDate;
    if (!addDueInterest(account, today)) continue;
    await Account.updateOne(
      { _id: account._id, 'interest.nextDate': was },
      { $set: { balance: account.balance, interest: account.interest } }
    );
  }
  return withBudget(null, budgetId);
};

type InterestDocument = AccountInterest & { ownerDocument: () => AccountDocument };

/*
 * What's built up and from when, as the app shows it: interest that hasn't been counted yet counts
 * from the last payment
 */
const interestFields = {
  accrued: (interest: InterestDocument) => interest.accrued ?? 0,
  accruedTo: (interest: InterestDocument) => savingsAccruedTo(interest.ownerDocument())
};

export const accountResolvers = {
  AccountInterest: interestFields,
  Mutation: {
    createAccount,
    updateAccount,
    deleteAccount,
    updateAccountBalances,
    assignPaymentAccounts,
    catchUpInterest
  }
};

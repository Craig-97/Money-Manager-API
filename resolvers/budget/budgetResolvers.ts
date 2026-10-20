import type { ClientSession, Types } from "mongoose";
import type { Request } from "express";
import type {
  CreateBudgetInput,
  UpdateBudgetInput,
  MarkPaymentsPaidInput,
  MarkPaymentsUnpaidInput,
  SkipRecurringPaymentsInput,
  StartPaydayCycleInput,
  LogDebtOverpaymentInput,
  UndoDebtOverpaymentInput,
} from "../../types/budget/budgetTypes";
import { PaymentType } from "../../constants/payment/paymentType";
import { PaymentRecordKind } from "../../constants/payment/paymentRecordKind";
import { LeftOverOutcome } from "../../constants/payday/leftOverOutcome";
import { AccountKind, PAID_INTO_KEY } from "../../constants/account/accountKind";
import { Account } from "../../models/account/Account";
import {
  accountFor,
  accountsOf,
  checkPaymentAccounts,
  countedBalance,
  moveMoney,
  paidIntoAccountOf,
  setBalance,
  setBalances,
} from "../account/accountResolvers";
import { checkBudgetAccess, checkAuth } from "../../middleware/isAuth";
import { Budget } from "../../models/budget/Budget";
import { User } from "../../models/user/User";
import { Note } from "../../models/note/Note";
import { OneOffPayment } from "../../models/payment/OneOffPayment";
import { Payday } from "../../models/payday/Payday";
import { RecurringPayment } from "../../models/payment/RecurringPayment";
import {
  PaymentRecord,
  type RecordDebt,
  type RecordTransfer,
} from "../../models/payment/PaymentRecord";
import {
  latestOpenRecord,
  recordBalanceSet,
  snapshotOf,
  withThisCycle,
} from "../payment/paymentRecordResolvers";
import {
  USER_NOT_FOUND,
  BUDGET_NOT_FOUND,
  BUDGET_NOT_LINKED,
  BUDGET_EXISTS,
  BUDGET_UPDATE_FAILED,
  RECURRING_PAYMENT_NOT_FOUND,
  PAYMENT_NOT_FOUND,
  DEBT_NOT_TRACKED,
  OVERPAYMENT_TOO_LARGE,
  PAYMENT_RECORD_NOT_FOUND,
  PAYMENT_RECORD_CLOSED,
  ACCOUNT_NOT_ALLOWED,
  incrementVersion,
  roundPence,
  payTowardsDebt,
  withBalanceDate,
  withTransaction,
  validateUniqueName,
  parseInput,
  newBudget,
  budgetInput,
  paydayCycle,
  skipRecurring,
  debtOverpayment,
} from "../../utils";
import {
  addDays,
  nextOccurrence,
  occurrencesBefore,
  ukDay,
} from "../../utils/dates";

type BudgetDocument = InstanceType<typeof Budget>;

// One of the signed-in user's budgets, or their default budget when no id is given
const findBudget = async (
  _: unknown,
  { id }: { id?: string | null },
  req: Request,
) => {
  checkAuth(req);

  let budgetId = id;
  if (budgetId) {
    await checkBudgetAccess(budgetId, req);
  } else {
    const user = await User.findById(req.userId);
    if (!user) {
      throw USER_NOT_FOUND(req.userId);
    }
    // Setup isn't finished until the user has a budget
    if (!user.budget) {
      throw BUDGET_NOT_LINKED();
    }
    budgetId = String(user.budget);
  }

  const budget = await Budget.findById(budgetId);
  if (!budget) {
    throw BUDGET_NOT_FOUND(budgetId);
  }
  return budget;
};

// A new budget for the signed-in user, with any payments and payday set up alongside it
const createBudget = async (
  _: unknown,
  { input }: { input: CreateBudgetInput },
  req: Request,
) => {
  checkAuth(req);
  const {
    bankBalance,
    paidIntoName,
    accounts = [],
    monthlyIncome,
    oneOffPayments = [],
    recurringPayments = [],
    payday,
  } = parseInput(newBudget, input);

  return withTransaction(async (session) => {
    const user = await User.findById(req.userId).session(session);
    if (!user) {
      throw USER_NOT_FOUND(req.userId);
    }

    // One budget each for now
    const existingBudget = await Budget.findOne({ user: user._id }).session(
      session,
    );
    if (existingBudget) {
      throw BUDGET_EXISTS(existingBudget.id);
    }

    const budget = await new Budget({
      monthlyIncome,
      user: user._id,
      // Setup starts the first cycle, so the payday prompt waits for the next payday
      cycleStartedOn: ukDay(),
    }).save({ session });

    // Where pay lands, holding the balance the user started with, then the other accounts. Payments
    // set up alongside them name them by key.
    const paidInto = await new Account({
      budget: budget._id,
      name: paidIntoName ?? "Current account",
      kind: AccountKind.SPENDING,
      paidInto: true,
      balance: bankBalance,
      counts: true,
      balanceUpdatedAt: new Date(),
    }).save({ session });
    const keys = new Map<string, Types.ObjectId>([[PAID_INTO_KEY, paidInto._id]]);
    for (const { key, kind, counts, interestRate, purpose, ...account } of accounts ?? []) {
      const spending = kind === AccountKind.SPENDING;
      const saved = await new Account({
        ...account,
        budget: budget._id,
        kind: kind ?? AccountKind.SAVINGS,
        counts: counts ?? spending,
        interestRate: interestRate ?? null,
        purpose: purpose ?? null,
        balanceUpdatedAt: new Date(),
      }).save({ session });
      keys.set(key, saved._id);
    }
    const idOf = (key: string | null | undefined, field: "account" | "paysInto") => {
      if (!key) return null;
      const id = keys.get(key);
      if (!id) throw ACCOUNT_NOT_ALLOWED(key, field);
      return id;
    };

    // The budget the app opens when it isn't given one
    user.budget = budget._id;
    await user.save({ session });

    // Check for name conflicts for all payments
    await Promise.all(
      [...oneOffPayments, ...recurringPayments].map((payment) =>
        validateUniqueName(payment.name, budget._id, session),
      ),
    );

    // Sequential: operations within a transaction session can't run in parallel
    for (const payment of oneOffPayments ?? []) {
      const mapped = { ...payment, account: idOf(payment.account, "account") };
      await checkPaymentAccounts(mapped, { budget: budget._id, session });
      await new OneOffPayment({ ...mapped, budget: budget._id }).save({ session });
    }
    const saved = [];
    for (const payment of recurringPayments ?? []) {
      const mapped = {
        ...payment,
        account: idOf(payment.account, "account"),
        paysInto: idOf(payment.paysInto, "paysInto"),
      };
      await checkPaymentAccounts(mapped, { budget: budget._id, session });
      saved.push(
        await new RecurringPayment({
          ...mapped,
          debt: withBalanceDate(payment.debt),
          budget: budget._id,
        }).save({ session }),
      );
    }
    // Each debt's starting balance goes in its history
    for (const payment of saved) {
      if (payment.debt) await recordBalanceSet(payment, null, session);
    }

    if (payday) {
      await new Payday({ ...payday, budget: budget._id }).save({ session });
    }

    return { budget, success: true };
  });
};

const updateBudget = async (
  _: unknown,
  { id, input }: { id: string; input: UpdateBudgetInput },
  req: Request,
) => {
  checkAuth(req);
  await checkBudgetAccess(id, req);

  const { monthlyIncome } = parseInput(budgetInput, input);
  if (monthlyIncome === undefined) {
    throw BUDGET_UPDATE_FAILED();
  }

  const budget = await Budget.findById(id);
  if (!budget) {
    throw BUDGET_NOT_FOUND(id);
  }

  budget.monthlyIncome = monthlyIncome;

  incrementVersion(budget);
  await budget.save();

  return { budget, success: true };
};

// Payday: sets the confirmed balance and starts the new cycle. Last cycle's records are closed: they
// stay as history but can't be undone, as the confirmed balance already allows for them. Paid
// one-offs are cleared away. Recording the payday stops the prompt showing again for it.
//
// Recurring payments with dates left over from last cycle get what the user said happened: PAID
// records them as paid and SKIPPED as skipped (both closed, and moved on to their first date from
// payday), while DUE, or not saying, leaves them overdue. Payments due from payday to today that
// have already gone out are recorded as paid in the new cycle. Neither changes the balance, since
// the confirmed one already has them taken off, but a debt still goes down.
const startPaydayCycle = async (
  _: unknown,
  { input }: { input: StartPaydayCycleInput },
  req: Request,
) => {
  checkAuth(req);
  const { budgetId, payday, paidIntoBalance, accountBalances, leftOver, alreadyPaid } = parseInput(
    paydayCycle,
    input,
  );
  await checkBudgetAccess(budgetId, req);

  return withTransaction(async (session) => {
    const budget = await Budget.findById(budgetId).session(session);
    if (!budget) {
      throw BUDGET_NOT_FOUND(budgetId);
    }

    const cycleStart = new Date(payday);
    const today = ukDay();
    const payments = await RecurringPayment.find({ budget: budgetId }).session(
      session,
    );
    const outcomes = new Map(
      leftOver.map(({ recurringPaymentId, outcome }) => [recurringPaymentId, outcome]),
    );
    const goneOut = new Set(alreadyPaid?.recurringPaymentIds ?? []);
    for (const id of [...outcomes.keys(), ...goneOut]) {
      if (!payments.some((payment) => payment.id === id)) {
        throw RECURRING_PAYMENT_NOT_FOUND(id);
      }
    }

    // Done with once the cycle has ended. Anything already dealt with from payday on belongs to
    // the new cycle, so it stays open and can still be undone.
    await PaymentRecord.updateMany(
      {
        budget: budgetId,
        open: true,
        dates: { $not: { $elemMatch: { $gte: cycleStart } } },
      },
      { $set: { open: false } },
      { session },
    );
    await OneOffPayment.deleteMany({
      budget: budgetId,
      paidAt: { $ne: null },
      dueDate: { $lt: cycleStart },
    }).session(session);

    // Sequential: operations within a transaction session can't run in parallel
    for (const payment of payments) {
      let changed = false;
      const outcome = outcomes.get(payment.id);
      const next = payment.nextDueDate;
      if (next && next < cycleStart && outcome && outcome !== LeftOverOutcome.DUE) {
        const dates = occurrencesBefore(payment, next, cycleStart);
        changed =
          outcome === LeftOverOutcome.PAID
            ? await recordAlreadyPaid(payment, { dates, session, open: false })
            : await handle(payment, PaymentRecordKind.SKIPPED, dates, session, {
                balanceChange: 0,
                open: false,
              });
      }
      // Gone out since payday: its dates up to today, once it's in the new cycle
      if (goneOut.has(payment.id) && payment.nextDueDate && payment.nextDueDate >= cycleStart) {
        const dates = occurrencesBefore(payment, payment.nextDueDate, addDays(today, 1));
        if (await recordAlreadyPaid(payment, { dates, session, open: true })) changed = true;
      }
      if (!changed) continue;
      payment.increment();
      await payment.save({ session });
    }

    for (const id of alreadyPaid?.oneOffPaymentIds ?? []) {
      const payment = await OneOffPayment.findOne({ _id: id, budget: budgetId }).session(session);
      if (!payment) {
        throw PAYMENT_NOT_FOUND(id);
      }
      if (payment.paidAt) continue;
      await new PaymentRecord({
        budget: payment.budget,
        oneOffPayment: payment._id,
        payment: snapshotOf(payment),
        kind: PaymentRecordKind.PAID,
        dates: [payment.dueDate ?? today],
        balanceChange: 0,
      }).save({ session });
      payment.paidAt = new Date();
      incrementVersion(payment);
      await payment.save({ session });
    }

    // The balances the user confirmed go on last, over anything moved into accounts above
    const paidInto = await paidIntoAccountOf(budgetId, session);
    setBalance(paidInto, paidIntoBalance);
    await paidInto.save({ session });
    await setBalances(budgetId, { balances: accountBalances ?? [], session });

    budget.cycleStartedOn = cycleStart;
    incrementVersion(budget);
    await budget.save({ session });

    return { budget, success: true };
  });
};

// What paying a payment does to the bank balance: money out comes off, money in goes on
const balanceChange = (payment: { amount: number; type: string }) =>
  payment.type === PaymentType.INCOME ? payment.amount : -payment.amount;

type RecurringPaymentDocument = InstanceType<typeof RecurringPayment>;
type AccountId = Types.ObjectId | null | undefined;

// What a change does to a balance: on the payment's own account, or on the one a record says it
// went on (none: the one pay lands in)
type BalanceEffect = number | { amount: number; account: AccountId };

/* Moves an account's balance; none means the one pay lands in */
const moveOn = async (
  budgetId: string,
  { account, amount, session }: { account: AccountId; amount: number; session: ClientSession },
) => {
  if (!amount) return;
  await moveMoney(await accountFor(budgetId, { account, session }), { amount, session });
};

/*
 * Pays, skips or undoes some of a budget's recurring payments in one transaction. `change`
 * updates a payment, writing or removing its records in the same session, and returns what it
 * does to the balance, or null when it leaves the payment alone.
 */
const changeRecurringPayments = (
  budgetId: string,
  recurringPaymentIds: string[],
  change: (
    payment: RecurringPaymentDocument,
    session: ClientSession,
  ) => Promise<BalanceEffect | null>,
  // Further work in the same transaction, moving balances itself
  more?: (session: ClientSession) => Promise<void>,
) =>
  withTransaction(async (session) => {
    const budget = await Budget.findById(budgetId).session(session);
    if (!budget) {
      throw BUDGET_NOT_FOUND(budgetId);
    }

    // Sequential: operations within a transaction session can't run in parallel
    for (const id of recurringPaymentIds) {
      const payment = await RecurringPayment.findOne({
        _id: id,
        budget: budgetId,
      }).session(session);
      if (!payment) {
        throw RECURRING_PAYMENT_NOT_FOUND(id);
      }
      const effect = await change(payment, session);
      if (effect === null) continue;
      const { amount, account } =
        typeof effect === "number" ? { amount: effect, account: payment.account } : effect;
      await moveOn(budgetId, { account, amount, session });
      payment.increment();
      await payment.save({ session });
    }

    if (more) await more(session);

    incrementVersion(budget);
    await budget.save({ session });

    return { budget, success: true };
  });

/*
 * Records some of a payment's dates as paid or skipped, moving it on to the date after the last.
 * Returns false when there's nothing to record.
 */
const handle = async (
  payment: RecurringPaymentDocument,
  kind: typeof PaymentRecordKind.PAID | typeof PaymentRecordKind.SKIPPED,
  dates: Date[],
  session: ClientSession,
  paid: {
    balanceChange: number;
    // The account balanceChange went on
    account?: Types.ObjectId;
    debt?: RecordDebt;
    transfer?: RecordTransfer;
    open?: boolean;
  } = { balanceChange: 0 },
) => {
  if (!dates.length) return false;
  await new PaymentRecord({
    budget: payment.budget,
    recurringPayment: payment._id,
    payment: snapshotOf(payment),
    kind,
    dates,
    ...paid,
  }).save({ session });
  payment.nextDueDate = nextOccurrence(payment, addDays(dates[dates.length - 1], 1));
  return true;
};

/*
 * Records dates as paid that the confirmed payday balance already allows for: nothing comes off the
 * balance, but a debt still has each period's interest added and the payment taken off. Returns
 * false when there's nothing to record.
 */
const recordAlreadyPaid = async (
  payment: RecurringPaymentDocument,
  { dates, session, open }: { dates: Date[]; session: ClientSession; open: boolean },
) => {
  let debt: RecordDebt | undefined;
  if (payment.debt && dates.length) {
    let interest = 0;
    let reduction = 0;
    for (let k = 0; k < dates.length; k++) {
      const paidOff = payTowardsDebt(payment.debt, payment.amount, payment.frequency);
      interest += paidOff.interest;
      reduction += paidOff.reduction;
      payment.debt.balance = paidOff.balance;
    }
    debt = {
      interest: roundPence(interest),
      reduction: roundPence(reduction),
      balanceAfter: payment.debt.balance,
    };
  }
  const transfer = await payInto(payment, { times: dates.length, session });
  return handle(payment, PaymentRecordKind.PAID, dates, session, {
    balanceChange: 0,
    debt,
    transfer,
    open,
  });
};

/*
 * A payment into savings adds its amount there for each date paid, and says so for its record, so
 * undoing takes exactly that back off
 */
const payInto = async (
  payment: RecurringPaymentDocument,
  { times, session }: { times: number; session: ClientSession },
): Promise<RecordTransfer | undefined> => {
  if (!payment.paysInto || !times) return undefined;
  const amount = roundPence(payment.amount * times);
  await moveMoney(payment.paysInto, { amount, session });
  return { account: payment.paysInto, amount };
};

// Paying payments from the dashboard, as the bank balance sees it. A recurring payment has its
// next date paid and moves on to the one after. A one-off is marked paid and stays until payday,
// so paying it can be undone.
const markPaymentsPaid = async (
  _: unknown,
  { input }: { input: MarkPaymentsPaidInput },
  req: Request,
) => {
  checkAuth(req);
  const { budgetId, recurringPaymentIds, oneOffPaymentIds } = input;
  await checkBudgetAccess(budgetId, req);

  return changeRecurringPayments(
    budgetId,
    recurringPaymentIds,
    async (payment, session) => {
      // Nothing to pay once it has ended
      if (!payment.nextDueDate) return null;
      // A debt has the period's interest added, then the payment taken off
      let debt: RecordDebt | undefined;
      if (payment.debt) {
        const paidOff = payTowardsDebt(payment.debt, payment.amount, payment.frequency);
        payment.debt.balance = paidOff.balance;
        debt = {
          interest: paidOff.interest,
          reduction: paidOff.reduction,
          balanceAfter: paidOff.balance,
        };
      }
      const change = balanceChange(payment);
      const account = await accountFor(budgetId, { account: payment.account, session });
      const transfer = await payInto(payment, { times: 1, session });
      await handle(payment, PaymentRecordKind.PAID, [payment.nextDueDate], session, {
        balanceChange: change,
        account,
        debt,
        transfer,
      });
      return { amount: change, account };
    },
    async (session) => {
      for (const id of oneOffPaymentIds) {
        const payment = await OneOffPayment.findOne({
          _id: id,
          budget: budgetId,
        }).session(session);
        if (!payment) {
          throw PAYMENT_NOT_FOUND(id);
        }
        // Already paid: nothing more comes off
        if (payment.paidAt) continue;
        const change = balanceChange(payment);
        const account = await accountFor(budgetId, { account: payment.account, session });
        await new PaymentRecord({
          budget: payment.budget,
          oneOffPayment: payment._id,
          payment: snapshotOf(payment),
          kind: PaymentRecordKind.PAID,
          dates: [payment.dueDate ?? ukDay()],
          balanceChange: change,
          account,
        }).save({ session });
        payment.paidAt = new Date();
        incrementVersion(payment);
        await payment.save({ session });
        await moveOn(budgetId, { account, amount: change, session });
      }
    },
  );
};

// Undoes the latest pay or skip this cycle on each recurring payment, bringing its dates back, and
// makes paid one-offs unpaid. The record goes, and whatever paying did to the bank balance and a
// debt is put back exactly, even if the payment has changed since.
const markPaymentsUnpaid = async (
  _: unknown,
  { input }: { input: MarkPaymentsUnpaidInput },
  req: Request,
) => {
  checkAuth(req);
  const { budgetId, recurringPaymentIds, oneOffPaymentIds } = input;
  await checkBudgetAccess(budgetId, req);

  return changeRecurringPayments(
    budgetId,
    recurringPaymentIds,
    async (payment, session) => {
      const latest = await latestOpenRecord(payment._id, session);
      if (!latest) return null;
      await PaymentRecord.deleteOne({ _id: latest._id }).session(session);
      payment.nextDueDate = latest.dates[0];
      if (payment.debt && latest.debt) {
        payment.debt.balance = roundPence(payment.debt.balance + latest.debt.reduction);
      }
      if (latest.transfer) {
        await moveMoney(latest.transfer.account, { amount: -latest.transfer.amount, session });
      }
      return { amount: -latest.balanceChange, account: latest.account };
    },
    async (session) => {
      for (const id of oneOffPaymentIds ?? []) {
        const payment = await OneOffPayment.findOne({
          _id: id,
          budget: budgetId,
        }).session(session);
        if (!payment) {
          throw PAYMENT_NOT_FOUND(id);
        }
        const record = await PaymentRecord.findOne({
          oneOffPayment: payment._id,
          open: true,
          kind: PaymentRecordKind.PAID,
        }).session(session);
        if (!record) continue;
        await PaymentRecord.deleteOne({ _id: record._id }).session(session);
        payment.paidAt = null;
        incrementVersion(payment);
        await payment.save({ session });
        await moveOn(budgetId, {
          account: record.account,
          amount: -record.balanceChange,
          session,
        });
      }
    },
  );
};

// Leaves payments' dates unpaid without touching the balance: the next date, or every date before
// `until` (usually the next payday) to skip the rest of a cycle at once.
const skipRecurringPayments = async (
  _: unknown,
  { input }: { input: SkipRecurringPaymentsInput },
  req: Request,
) => {
  checkAuth(req);
  const { budgetId, recurringPaymentIds, until } = parseInput(
    skipRecurring,
    input,
  );
  await checkBudgetAccess(budgetId, req);

  return changeRecurringPayments(
    budgetId,
    recurringPaymentIds,
    async (payment, session) => {
      const next = payment.nextDueDate;
      if (!next) return null;
      const dates = until
        ? occurrencesBefore(payment, next, new Date(until))
        : [next];
      return (await handle(payment, PaymentRecordKind.SKIPPED, dates, session))
        ? 0
        : null;
    },
  );
};

// Pays extra off a debt today, on top of its usual payments. It's money out of the bank like any
// payment, and comes straight off what's left to pay.
const logDebtOverpayment = async (
  _: unknown,
  { input }: { input: LogDebtOverpaymentInput },
  req: Request,
) => {
  checkAuth(req);
  const { budgetId, recurringPaymentId, amount } = parseInput(
    debtOverpayment,
    input,
  );
  await checkBudgetAccess(budgetId, req);

  return changeRecurringPayments(
    budgetId,
    [recurringPaymentId],
    async (payment, session) => {
      if (!payment.debt) {
        throw DEBT_NOT_TRACKED(recurringPaymentId);
      }
      if (amount > payment.debt.balance) {
        throw OVERPAYMENT_TOO_LARGE();
      }
      payment.debt.balance = roundPence(payment.debt.balance - amount);
      const account = await accountFor(budgetId, { account: payment.account, session });
      await new PaymentRecord({
        budget: payment.budget,
        recurringPayment: payment._id,
        payment: snapshotOf(payment),
        kind: PaymentRecordKind.OVERPAYMENT,
        dates: [ukDay()],
        balanceChange: -amount,
        account,
        debt: { interest: 0, reduction: amount, balanceAfter: payment.debt.balance },
      }).save({ session });
      return { amount: -amount, account };
    },
  );
};

// Takes back an overpayment from this cycle: the record goes, and the amount goes back on the debt
// and the bank balance
const undoDebtOverpayment = async (
  _: unknown,
  { input }: { input: UndoDebtOverpaymentInput },
  req: Request,
) => {
  checkAuth(req);
  const { budgetId, recordId } = input;
  await checkBudgetAccess(budgetId, req);

  const record = await PaymentRecord.findOne({
    _id: recordId,
    budget: budgetId,
    kind: PaymentRecordKind.OVERPAYMENT,
  });
  if (!record || !record.recurringPayment) {
    throw PAYMENT_RECORD_NOT_FOUND(recordId);
  }
  if (!record.open) {
    throw PAYMENT_RECORD_CLOSED();
  }

  return changeRecurringPayments(
    budgetId,
    [String(record.recurringPayment)],
    async (payment, session) => {
      const removed = await PaymentRecord.deleteOne({
        _id: record._id,
        open: true,
      }).session(session);
      if (removed.deletedCount !== 1) {
        throw PAYMENT_RECORD_NOT_FOUND(recordId);
      }
      if (payment.debt && record.debt) {
        payment.debt.balance = roundPence(payment.debt.balance + record.debt.reduction);
      }
      return { amount: -record.balanceChange, account: record.account };
    },
  );
};

const byAmount = { amount: 1 } as const;

// What's on a budget is only loaded when a query asks for it. Each returns exec()'s promise
// rather than the query itself: Apollo calls then() more than once, and a query runs on each call.
const budgetFields = {
  user: (budget: BudgetDocument) => User.findById(budget.user).exec(),
  accounts: (budget: BudgetDocument) => accountsOf(budget._id),
  bankBalance: (budget: BudgetDocument) => countedBalance(budget._id),
  oneOffPayments: (budget: BudgetDocument) =>
    OneOffPayment.find({ budget: budget._id }).sort(byAmount).exec(),
  // With this cycle's pays and skips loaded in one go, for their thisCycle field
  recurringPayments: async (budget: BudgetDocument) =>
    withThisCycle(
      await RecurringPayment.find({ budget: budget._id }).sort(byAmount).exec(),
    ),
  notes: (budget: BudgetDocument) => Note.find({ budget: budget._id }).exec(),
  payday: (budget: BudgetDocument) => Payday.findOne({ budget: budget._id }).exec(),
};

// Export the resolvers
export const budgetResolvers = {
  Query: {
    budget: findBudget,
  },
  Mutation: {
    createBudget,
    updateBudget,
    startPaydayCycle,
    markPaymentsPaid,
    markPaymentsUnpaid,
    skipRecurringPayments,
    logDebtOverpayment,
    undoDebtOverpayment,
  },
  Budget: budgetFields,
};

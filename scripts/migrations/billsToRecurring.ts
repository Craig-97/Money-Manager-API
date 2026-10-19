import mongoose, { type Types } from 'mongoose';
import type { BankHolidayRegion } from '../../constants/payday';
import { RecurringPaymentCategory, PaymentFrequency } from '../../constants/payment';
import { PaymentType } from '../../constants/payment/paymentType';
import { Budget } from '../../models/budget/Budget';
import { OneOffPayment } from '../../models/payment/OneOffPayment';
import { RecurringPayment } from '../../models/payment/RecurringPayment';
import { Payday } from '../../models/payday/Payday';
import { withTransaction } from '../../utils/helpers/transactionHelpers';
import { DEFAULT_PAYDAY, nextPayday, type BankHolidays } from '../../utils/payday/paydays';

/*
 * v1 bills become v2 recurring payments. A bill only had a name, an amount and a paid flag, so each
 * one becomes a monthly expense in OTHER, first due on the budget's next payday. That payday
 * starts the next cycle, so every payment starts unpaid whatever the bill's flag said.
 *
 * Only budgets with bills and no recurring payments are moved, so running it again changes
 * nothing. Bills are read straight from their collection and left there.
 */

interface StoredBill {
  _id: Types.ObjectId;
  budget: Types.ObjectId;
  name?: string;
  amount?: number;
  paid?: boolean;
}

export interface MovedBill {
  bill: string;
  name: string;
  amount: number;
}

export interface BudgetResult {
  budget: string;
  // Why nothing was moved, when nothing was
  skipped?: string;
  firstPaymentDate?: string;
  moved: MovedBill[];
  // Bills missing a name or amount, which can't become payments
  unusable: string[];
}

export interface BillsMigrationOptions {
  apply: boolean;
  today: Date;
  loadHolidays: (region: BankHolidayRegion) => Promise<BankHolidays>;
}

const NO_HOLIDAYS: BankHolidays = new Set();

// A name already used by one of the budget's one-off payments gets "(bill)" on the end
const freeName = (name: string, taken: Set<string>) => {
  let candidate = name;
  for (let n = 1; taken.has(candidate); n++) {
    candidate = n === 1 ? `${name} (bill)` : `${name} (bill ${n})`;
  }
  taken.add(candidate);
  return candidate;
};

const migrateBudget = async (
  budget: Types.ObjectId,
  bills: StoredBill[],
  { apply, today, loadHolidays }: BillsMigrationOptions
): Promise<BudgetResult> => {
  const result: BudgetResult = { budget: String(budget), moved: [], unusable: [] };

  if (!(await Budget.exists({ _id: budget }))) {
    return { ...result, skipped: 'the budget no longer exists' };
  }
  if (await RecurringPayment.exists({ budget })) {
    return { ...result, skipped: 'it already has recurring payments' };
  }

  const payday = await Payday.findOne({ budget }).lean();
  const holidays = payday?.bankHolidayRegion ? await loadHolidays(payday.bankHolidayRegion) : NO_HOLIDAYS;
  const firstPaymentDate = nextPayday(payday ?? DEFAULT_PAYDAY, holidays, today);

  const taken = new Set(
    (await OneOffPayment.find({ budget }, { name: 1 }).lean()).map(payment => payment.name as string)
  );

  for (const bill of bills) {
    const name = bill.name?.trim();
    if (!name || typeof bill.amount !== 'number' || bill.amount < 0) {
      result.unusable.push(String(bill._id));
      continue;
    }
    result.moved.push({ bill: String(bill._id), name: freeName(name, taken), amount: bill.amount });
  }

  if (apply && result.moved.length) {
    await withTransaction(async session => {
      // One at a time: operations in a transaction can't run in parallel
      for (const { name, amount } of result.moved) {
        await new RecurringPayment({
          budget,
          name,
          amount,
          type: PaymentType.EXPENSE,
          category: RecurringPaymentCategory.OTHER,
          frequency: PaymentFrequency.MONTHLY,
          firstPaymentDate
        }).save({ session });
      }
    });
  }

  return { ...result, firstPaymentDate };
};

export const migrateBills = async (options: BillsMigrationOptions) => {
  const bills = await mongoose.connection
    .collection<StoredBill>('bills')
    .find({}, { sort: { amount: 1 } })
    .toArray();

  const byBudget = new Map<string, StoredBill[]>();
  for (const bill of bills) {
    const key = String(bill.budget);
    byBudget.set(key, [...(byBudget.get(key) ?? []), bill]);
  }

  const results: BudgetResult[] = [];
  // One budget at a time, each in its own transaction, so a failure leaves the others done
  for (const budgetBills of byBudget.values()) {
    results.push(await migrateBudget(budgetBills[0].budget, budgetBills, options));
  }
  return results;
};

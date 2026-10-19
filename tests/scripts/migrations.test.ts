import mongoose from 'mongoose';
import { setupTestApp, teardownTestApp, clearDatabase, gql, createUserWithBudget } from '../helpers';
import { accountsToBudgets } from '../../scripts/migrations/accountsToBudgets';
import { migrateBills } from '../../scripts/migrations/billsToRecurring';
import { removeBudgetIdLists } from '../../scripts/migrations/removeBudgetIdLists';
import { fromIsoDay } from '../../utils/payday/paydays';
import { moveHandledToRecords } from '../../scripts/migrations/handledToRecords';
import { migrateRenewalReminders } from '../../scripts/migrations/renewalReminders';

beforeAll(setupTestApp);
afterAll(teardownTestApp);
beforeEach(async () => {
  await clearDatabase();
  await mongoose.connection.collection('bills').deleteMany({});
});

const bills = () => mongoose.connection.collection('bills');
const oid = (id: string) => new mongoose.Types.ObjectId(id);
const today = fromIsoDay('2030-01-10');
const loadHolidays = async () => new Set<string>();
const run = (apply: boolean) => migrateBills({ apply, today, loadHolidays });

const addBills = (budgetId: string, ...items: { name?: string; amount?: number; paid?: boolean }[]) =>
  bills().insertMany(items.map(item => ({ budget: oid(budgetId), ...item })));

const recurringNames = async (budgetId: string) =>
  (await mongoose.model('RecurringPayment').find({ budget: budgetId }).sort({ name: 1 })).map(
    payment => payment.name
  );

describe('accountsToBudgets', () => {
  const PAYDAY = { frequency: 'MONTHLY', type: 'SET_DAY', dayOfMonth: 15 };
  const db = () => mongoose.connection.db as NonNullable<typeof mongoose.connection.db>;

  // A dry run leaves the old collection and index behind, and clearing the database between tests
  // only removes records, so put both back the way the other tests expect
  afterEach(async () => {
    if (await db().listCollections({ name: 'accounts' }).hasNext()) await db().collection('accounts').drop();
    if (await db().collection('paydays').indexExists('account_1')) await db().collection('paydays').dropIndex('account_1');
    await Promise.all(Object.values(mongoose.models).map(model => model.syncIndexes()));
  });

  // Puts a budget back the way older versions stored it: an accounts collection, each record's
  // account field, and a unique index on that field
  const asOldAccount = async () => {
    await db().collection('accounts').drop();
    await db().renameCollection('budgets', 'accounts');
    for (const name of ['users', 'paydays']) {
      await db().collection(name).updateMany({ budget: { $exists: true } }, { $rename: { budget: 'account' } });
    }
    await db().collection('paydays').dropIndex('budget_1');
    await db().collection('paydays').createIndex({ account: 1 }, { unique: true, name: 'account_1' });
  };

  it('writes nothing on a dry run', async () => {
    const { budgetId } = await createUserWithBudget({ budget: { payday: PAYDAY } });
    await asOldAccount();

    const result = await accountsToBudgets({ apply: false });
    expect(result).toMatchObject({ renamesCollection: true, replacesEmptyBudgets: false, budgets: 1 });
    expect(result.linked).toEqual(
      expect.arrayContaining([
        { collection: 'users', records: 1, indexes: [] },
        { collection: 'paydays', records: 1, indexes: ['account_1'] }
      ])
    );
    expect(await db().collection('accounts').countDocuments({ _id: oid(budgetId) })).toBe(1);
    expect(await db().collection('paydays').countDocuments({ account: oid(budgetId) })).toBe(1);
  });

  it('renames the collection and every link, so the budget loads again', async () => {
    const { token, budgetId } = await createUserWithBudget({ budget: { payday: PAYDAY } });
    await asOldAccount();

    await accountsToBudgets({ apply: true });

    const names = (await db().listCollections({}, { nameOnly: true }).toArray()).map(c => c.name);
    expect(names).toContain('budgets');
    // The accounts collection is the bank accounts' now, with nothing of the old budgets left in it
    expect(await db().collection('accounts').countDocuments({ user: { $exists: true } })).toBe(0);
    expect(await db().collection('paydays').countDocuments({ account: { $exists: true } })).toBe(0);
    const indexes = (await db().collection('paydays').indexes()).map(index => index.name);
    expect(indexes).toContain('budget_1');
    expect(indexes).not.toContain('account_1');

    const body = await gql(`query { budget { id payday { id } } }`, undefined, token);
    expect(body.errors).toBeUndefined();
    expect(body.data.budget).toMatchObject({ id: budgetId, payday: { id: expect.any(String) } });
  });

  it('leaves bank accounts in the accounts collection alone', async () => {
    await createUserWithBudget();
    const result = await accountsToBudgets({ apply: true });
    expect(result).toMatchObject({ renamesCollection: false, budgets: 0 });
    expect(await db().collection('accounts').countDocuments({ kind: 'SPENDING' })).toBe(1);
  });

  it('stops when the accounts collection holds old budgets and bank accounts', async () => {
    await createUserWithBudget();
    await db().collection('accounts').insertOne({ user: oid('507f1f77bcf86cd799439011'), bankBalance: 1 });
    await expect(accountsToBudgets({ apply: true })).rejects.toThrow('holds old budgets and bank accounts');
    await db().collection('accounts').deleteMany({ user: { $exists: true } });
  });

  it('has nothing to do once renamed', async () => {
    await createUserWithBudget();
    expect(await accountsToBudgets({ apply: true })).toEqual({ renamesCollection: false, replacesEmptyBudgets: false, budgets: 0, linked: [] });
  });

  it('replaces the empty budgets collection the API makes when it connects', async () => {
    const { token, budgetId } = await createUserWithBudget({ budget: { payday: PAYDAY } });
    await asOldAccount();
    await db().createCollection('budgets');

    expect(await accountsToBudgets({ apply: true })).toMatchObject({ renamesCollection: true, replacesEmptyBudgets: true, budgets: 1 });
    const body = await gql(`query { budget { id } }`, undefined, token);
    expect(body.data.budget).toEqual({ id: budgetId });
  });

  it('stops when both collections have data, rather than guess how to merge them', async () => {
    await createUserWithBudget();
    await db().collection('accounts').drop();
    await db().collection('accounts').insertOne({ user: oid('507f1f77bcf86cd799439011'), bankBalance: 1 });
    await expect(accountsToBudgets({ apply: true })).rejects.toThrow('Both an accounts and a budgets collection have data');
  });
});

describe('migrateBills', () => {
  it('writes nothing on a dry run', async () => {
    const { budgetId } = await createUserWithBudget();
    await addBills(budgetId, { name: 'Rent', amount: 800, paid: true });
    const [result] = await run(false);
    expect(result).toMatchObject({ budget: budgetId, firstPaymentDate: '2030-01-31' });
    expect(result.moved).toEqual([expect.objectContaining({ name: 'Rent', amount: 800 })]);
    expect(await mongoose.model('RecurringPayment').countDocuments()).toBe(0);
  });

  it('turns bills into unpaid monthly expenses due on the next payday', async () => {
    const { token, budgetId } = await createUserWithBudget({
      budget: { payday: { frequency: 'MONTHLY', type: 'SET_DAY', dayOfMonth: 15 } }
    });
    await addBills(budgetId, { name: 'Rent', amount: 800, paid: true }, { name: 'Phone', amount: 20 });
    await run(true);

    const body = await gql(
      `query { budget { recurringPayments { name amount type category frequency thisCycle { kind } firstPaymentDate } } }`,
      undefined,
      token
    );
    expect(body.errors).toBeUndefined();
    const firstPaymentDate = String(new Date('2030-01-15').getTime());
    const common = { type: 'EXPENSE', category: 'OTHER', frequency: 'MONTHLY', thisCycle: [], firstPaymentDate };
    expect(body.data.budget.recurringPayments).toEqual([
      { name: 'Phone', amount: 20, ...common },
      { name: 'Rent', amount: 800, ...common }
    ]);
    // The bills are left for checking before they're dropped
    expect(await bills().countDocuments()).toBe(2);
  });

  it('skips budgets that already have recurring payments, so a second run changes nothing', async () => {
    const { budgetId } = await createUserWithBudget();
    await addBills(budgetId, { name: 'Rent', amount: 800 });
    await run(true);
    const [again] = await run(true);
    expect(again.skipped).toBe('it already has recurring payments');
    expect(await recurringNames(budgetId)).toEqual(['Rent']);
  });

  it('renames a bill whose name a one-off payment already uses', async () => {
    const { budgetId } = await createUserWithBudget({
      budget: {
        oneOffPayments: [{ name: 'Gym', amount: 5, dueDate: '2030-02-01', type: 'EXPENSE', category: 'FOOD' }]
      }
    });
    await addBills(budgetId, { name: 'Gym', amount: 30 });
    await run(true);
    expect(await recurringNames(budgetId)).toEqual(['Gym (bill)']);
  });

  it('leaves out bills with no name or amount', async () => {
    const { budgetId } = await createUserWithBudget();
    await addBills(budgetId, { name: 'Rent', amount: 800 }, { name: '  ', amount: 5 }, { name: 'Odd' });
    const [result] = await run(true);
    expect(result.unusable).toHaveLength(2);
    expect(await recurringNames(budgetId)).toEqual(['Rent']);
  });

  it('skips bills whose budget no longer exists', async () => {
    await addBills(String(new mongoose.Types.ObjectId()), { name: 'Rent', amount: 800 });
    const [result] = await run(true);
    expect(result.skipped).toBe('the budget no longer exists');
    expect(await mongoose.model('RecurringPayment').countDocuments()).toBe(0);
  });
});

describe('removeBudgetIdLists', () => {
  it('only counts on a dry run, then removes the stored lists', async () => {
    const { budgetId } = await createUserWithBudget();
    await createUserWithBudget();
    const budgets = mongoose.connection.collection('budgets');
    await budgets.updateOne({ _id: oid(budgetId) }, { $set: { notes: [], payday: oid(budgetId) } });

    expect(await removeBudgetIdLists({ apply: false })).toEqual({ found: 1, cleaned: 0 });
    expect(await removeBudgetIdLists({ apply: true })).toEqual({ found: 1, cleaned: 1 });

    const stored = await budgets.findOne({ _id: oid(budgetId) });
    expect(stored).not.toHaveProperty('notes');
    expect(stored).not.toHaveProperty('payday');
    expect(stored).toHaveProperty('monthlyIncome', 2000);
  });
});

describe('moveHandledToRecords', () => {
  const CREATE = `mutation ($input: CreateRecurringPaymentInput!) {
    createRecurringPayment(input: $input) { recurringPayment { id } }
  }`;
  const HANDLED = `query { budget { bankBalance recurringPayments { thisCycle { kind dates } history { kind balanceChange open } } } }`;
  const UNPAID = `mutation ($input: MarkPaymentsUnpaidInput!) {
    markPaymentsUnpaid(input: $input) { budget { bankBalance } }
  }`;
  const day = (iso: string) => new Date(iso);

  it('turns each handled entry into an open record and takes the list off the payment', async () => {
    const { token, budgetId } = await createUserWithBudget();
    const created = await gql(
      CREATE,
      {
        input: {
          budgetId,
          name: 'Cleaner',
          amount: 50,
          category: 'OTHER',
          frequency: 'WEEKLY',
          type: 'EXPENSE',
          firstPaymentDate: '2030-01-07'
        }
      },
      token
    );
    const id = created.data.createRecurringPayment.recurringPayment.id;
    const payments = mongoose.connection.collection('recurringpayments');
    // As stored before records: one paid before amounts were recorded, one paid after, one skip
    await payments.updateOne(
      { _id: oid(id) },
      {
        $set: {
          handled: [
            { outcome: 'PAID', dates: [day('2030-01-07')] },
            { outcome: 'PAID', dates: [day('2030-01-14')], amount: 45 },
            { outcome: 'SKIPPED', dates: [day('2030-01-21'), day('2030-01-28')] }
          ]
        }
      }
    );

    expect(await moveHandledToRecords({ apply: false })).toEqual({ payments: 1, records: 3, moved: 0 });
    expect(await mongoose.model('PaymentRecord').countDocuments()).toBe(0);

    expect(await moveHandledToRecords({ apply: true })).toEqual({ payments: 1, records: 3, moved: 1 });
    expect(await payments.findOne({ _id: oid(id) })).not.toHaveProperty('handled');

    const body = await gql(HANDLED, {}, token);
    const [payment] = body.data.budget.recurringPayments;
    expect(payment.thisCycle.map((record: { kind: string }) => record.kind)).toEqual(['PAID', 'PAID', 'SKIPPED']);
    expect(payment.history).toEqual([
      { kind: 'SKIPPED', balanceChange: 0, open: true },
      { kind: 'PAID', balanceChange: -45, open: true },
      { kind: 'PAID', balanceChange: -50, open: true }
    ]);

    // Undoing still works from the records: the skip, then the £45 payment
    await gql(UNPAID, { input: { budgetId, recurringPaymentIds: [id] } }, token);
    const undone = await gql(UNPAID, { input: { budgetId, recurringPaymentIds: [id] } }, token);
    expect(undone.data.markPaymentsUnpaid.budget.bankBalance).toBe(1045);
  });

  it('has nothing to do once moved', async () => {
    expect(await moveHandledToRecords({ apply: true })).toEqual({ payments: 0, records: 0, moved: 0 });
  });
});

describe('migrateRenewalReminders', () => {
  const payments = () => mongoose.connection.collection('recurringpayments');

  const addPayment = async (budgetId: string, fields: Record<string, unknown>) =>
    (
      await payments().insertOne({
        budget: oid(budgetId),
        amount: 10,
        category: 'OTHER',
        type: 'EXPENSE',
        frequency: 'MONTHLY',
        firstPaymentDate: new Date('2030-01-01'),
        ...fields
      })
    ).insertedId;

  it('keeps chosen days, keeps off ones off and has the rest follow the usual timing', async () => {
    const { budgetId } = await createUserWithBudget();
    const days = await addPayment(budgetId, { name: 'Phone', renewalDate: new Date('2031-01-01'), renewalReminderDays: 14 });
    const off = await addPayment(budgetId, { name: 'Broadband', renewalDate: new Date('2031-01-01'), renewalReminderDays: 0 });
    const yearly = await addPayment(budgetId, { name: 'Car insurance', frequency: 'ANNUALLY', renewalReminderDays: 0 });
    const plain = await addPayment(budgetId, { name: 'Gym', renewalReminderDays: 0 });
    await addPayment(budgetId, { name: 'Already moved', renewalReminder: { off: false, days: 7 } });

    expect(await migrateRenewalReminders({ apply: false })).toEqual({ found: 4, kept: 1, off: 1, usual: 2, changed: 0 });
    expect(await payments().findOne({ _id: days })).toHaveProperty('renewalReminderDays', 14);

    expect(await migrateRenewalReminders({ apply: true })).toEqual({ found: 4, kept: 1, off: 1, usual: 2, changed: 4 });

    const usual = { off: false, days: null };
    const stored = async (id: unknown) => payments().findOne({ _id: id as mongoose.Types.ObjectId });
    expect(await stored(days)).toMatchObject({ renewalReminder: { off: false, days: 14 }, dueReminder: usual });
    expect(await stored(off)).toMatchObject({ renewalReminder: { off: true, days: null } });
    expect(await stored(yearly)).toMatchObject({ renewalReminder: usual });
    expect(await stored(plain)).toMatchObject({ renewalReminder: usual });
    expect(await stored(plain)).not.toHaveProperty('renewalReminderDays');

    // Run again, there's nothing left to do
    expect(await migrateRenewalReminders({ apply: true })).toEqual({ found: 0, kept: 0, off: 0, usual: 0, changed: 0 });
  });
});

import mongoose from 'mongoose';
import { setupTestApp, teardownTestApp, clearDatabase, gql, createUserWithAccount } from '../helpers';
import { migrateBills } from '../../scripts/migrations/billsToRecurring';
import { removeAccountIdLists } from '../../scripts/migrations/removeAccountIdLists';
import { fromIsoDay } from '../../scripts/migrations/nextPayday';

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

const addBills = (accountId: string, ...items: { name?: string; amount?: number; paid?: boolean }[]) =>
  bills().insertMany(items.map(item => ({ account: oid(accountId), ...item })));

const recurringNames = async (accountId: string) =>
  (await mongoose.model('RecurringPayment').find({ account: accountId }).sort({ name: 1 })).map(
    payment => payment.name
  );

describe('migrateBills', () => {
  it('writes nothing on a dry run', async () => {
    const { accountId } = await createUserWithAccount();
    await addBills(accountId, { name: 'Rent', amount: 800, paid: true });
    const [result] = await run(false);
    expect(result).toMatchObject({ account: accountId, firstPaymentDate: '2030-01-31' });
    expect(result.moved).toEqual([expect.objectContaining({ name: 'Rent', amount: 800 })]);
    expect(await mongoose.model('RecurringPayment').countDocuments()).toBe(0);
  });

  it('turns bills into unpaid monthly expenses due on the next payday', async () => {
    const { token, accountId } = await createUserWithAccount({
      account: { payday: { frequency: 'MONTHLY', type: 'SET_DAY', dayOfMonth: 15 } }
    });
    await addBills(accountId, { name: 'Rent', amount: 800, paid: true }, { name: 'Phone', amount: 20 });
    await run(true);

    const body = await gql(
      `query { account { recurringPayments { name amount type category frequency status firstPaymentDate } } }`,
      undefined,
      token
    );
    expect(body.errors).toBeUndefined();
    const firstPaymentDate = String(new Date('2030-01-15').getTime());
    const common = { type: 'EXPENSE', category: 'OTHER', frequency: 'MONTHLY', status: 'UNPAID', firstPaymentDate };
    expect(body.data.account.recurringPayments).toEqual([
      { name: 'Phone', amount: 20, ...common },
      { name: 'Rent', amount: 800, ...common }
    ]);
    // The bills are left for checking before they're dropped
    expect(await bills().countDocuments()).toBe(2);
  });

  it('skips accounts that already have recurring payments, so a second run changes nothing', async () => {
    const { accountId } = await createUserWithAccount();
    await addBills(accountId, { name: 'Rent', amount: 800 });
    await run(true);
    const [again] = await run(true);
    expect(again.skipped).toBe('it already has recurring payments');
    expect(await recurringNames(accountId)).toEqual(['Rent']);
  });

  it('renames a bill whose name a one-off payment already uses', async () => {
    const { accountId } = await createUserWithAccount({
      account: {
        oneOffPayments: [{ name: 'Gym', amount: 5, dueDate: '2030-02-01', type: 'EXPENSE', category: 'FOOD' }]
      }
    });
    await addBills(accountId, { name: 'Gym', amount: 30 });
    await run(true);
    expect(await recurringNames(accountId)).toEqual(['Gym (bill)']);
  });

  it('leaves out bills with no name or amount', async () => {
    const { accountId } = await createUserWithAccount();
    await addBills(accountId, { name: 'Rent', amount: 800 }, { name: '  ', amount: 5 }, { name: 'Odd' });
    const [result] = await run(true);
    expect(result.unusable).toHaveLength(2);
    expect(await recurringNames(accountId)).toEqual(['Rent']);
  });

  it('skips bills whose account no longer exists', async () => {
    await addBills(String(new mongoose.Types.ObjectId()), { name: 'Rent', amount: 800 });
    const [result] = await run(true);
    expect(result.skipped).toBe('the account no longer exists');
    expect(await mongoose.model('RecurringPayment').countDocuments()).toBe(0);
  });
});

describe('removeAccountIdLists', () => {
  it('only counts on a dry run, then removes the stored lists', async () => {
    const { accountId } = await createUserWithAccount();
    await createUserWithAccount();
    const accounts = mongoose.connection.collection('accounts');
    await accounts.updateOne({ _id: oid(accountId) }, { $set: { notes: [], payday: oid(accountId) } });

    expect(await removeAccountIdLists({ apply: false })).toEqual({ found: 1, cleaned: 0 });
    expect(await removeAccountIdLists({ apply: true })).toEqual({ found: 1, cleaned: 1 });

    const stored = await accounts.findOne({ _id: oid(accountId) });
    expect(stored).not.toHaveProperty('notes');
    expect(stored).not.toHaveProperty('payday');
    expect(stored).toHaveProperty('bankBalance', 1000);
  });
});

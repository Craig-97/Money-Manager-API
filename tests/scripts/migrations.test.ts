import mongoose from 'mongoose';
import { setupTestApp, teardownTestApp, clearDatabase, gql, createUserWithAccount } from '../helpers';
import { migrateBills } from '../../scripts/migrations/billsToRecurring';
import { removeAccountIdLists } from '../../scripts/migrations/removeAccountIdLists';
import { fromIsoDay } from '../../scripts/migrations/nextPayday';
import { moveHandledToRecords } from '../../scripts/migrations/handledToRecords';

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
      `query { account { recurringPayments { name amount type category frequency thisCycle { kind } firstPaymentDate } } }`,
      undefined,
      token
    );
    expect(body.errors).toBeUndefined();
    const firstPaymentDate = String(new Date('2030-01-15').getTime());
    const common = { type: 'EXPENSE', category: 'OTHER', frequency: 'MONTHLY', thisCycle: [], firstPaymentDate };
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

describe('moveHandledToRecords', () => {
  const CREATE = `mutation ($input: CreateRecurringPaymentInput!) {
    createRecurringPayment(input: $input) { recurringPayment { id } }
  }`;
  const HANDLED = `query { account { bankBalance recurringPayments { thisCycle { kind dates } history { kind balanceChange open } } } }`;
  const UNPAID = `mutation ($input: MarkPaymentsUnpaidInput!) {
    markPaymentsUnpaid(input: $input) { account { bankBalance } }
  }`;
  const day = (iso: string) => new Date(iso);

  it('turns each handled entry into an open record and takes the list off the payment', async () => {
    const { token, accountId } = await createUserWithAccount();
    const created = await gql(
      CREATE,
      {
        input: {
          accountId,
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
    const [payment] = body.data.account.recurringPayments;
    expect(payment.thisCycle.map((record: { kind: string }) => record.kind)).toEqual(['PAID', 'PAID', 'SKIPPED']);
    expect(payment.history).toEqual([
      { kind: 'SKIPPED', balanceChange: 0, open: true },
      { kind: 'PAID', balanceChange: -45, open: true },
      { kind: 'PAID', balanceChange: -50, open: true }
    ]);

    // Undoing still works from the records: the skip, then the £45 payment
    await gql(UNPAID, { input: { accountId, recurringPaymentIds: [id] } }, token);
    const undone = await gql(UNPAID, { input: { accountId, recurringPaymentIds: [id] } }, token);
    expect(undone.data.markPaymentsUnpaid.account.bankBalance).toBe(1045);
  });

  it('has nothing to do once moved', async () => {
    expect(await moveHandledToRecords({ apply: true })).toEqual({ payments: 0, records: 0, moved: 0 });
  });
});

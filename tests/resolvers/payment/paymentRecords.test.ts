import mongoose from 'mongoose';
import {
  setupTestApp,
  teardownTestApp,
  clearDatabase,
  gql,
  errorCode,
  createUserWithAccount,
  GqlBody,
  Variables
} from '../../helpers';

beforeAll(setupTestApp);
afterAll(teardownTestApp);
beforeEach(clearDatabase);

const HISTORY = 'history { id kind dates balanceChange open debt { interest reduction balanceAfter } }';
const RECURRING = `id name nextDueDate thisCycle { kind dates } debt { balance } ${HISTORY}`;
const ACCOUNT = `account { bankBalance recurringPayments { ${RECURRING} } oneOffPayments { id name paidAt } }`;

const CREATE = `mutation ($input: CreateRecurringPaymentInput!) {
  createRecurringPayment(input: $input) { recurringPayment { ${RECURRING} } }
}`;
const UPDATE = `mutation ($id: ID!, $input: UpdateRecurringPaymentInput!) {
  updateRecurringPayment(id: $id, input: $input) { recurringPayment { ${RECURRING} } }
}`;
const ONE_OFF = `mutation ($input: CreateOneOffPaymentInput!) {
  createOneOffPayment(input: $input) { oneOffPayment { id } }
}`;
const PAID = `mutation ($input: MarkPaymentsPaidInput!) { markPaymentsPaid(input: $input) { ${ACCOUNT} } }`;
const UNPAID = `mutation ($input: MarkPaymentsUnpaidInput!) { markPaymentsUnpaid(input: $input) { ${ACCOUNT} } }`;
const SKIP = `mutation ($input: SkipRecurringPaymentsInput!) { skipRecurringPayments(input: $input) { ${ACCOUNT} } }`;
const OVERPAY = `mutation ($input: LogDebtOverpaymentInput!) { logDebtOverpayment(input: $input) { ${ACCOUNT} } }`;
const UNDO_OVERPAY = `mutation ($input: UndoDebtOverpaymentInput!) { undoDebtOverpayment(input: $input) { ${ACCOUNT} } }`;
const START = `mutation ($input: StartPaydayCycleInput!) { startPaydayCycle(input: $input) { ${ACCOUNT} } }`;
const ACCOUNT_QUERY = `query { ${ACCOUNT} }`;
const DELETE_RECURRING = `mutation ($ids: [ID!]!) { batchDeleteRecurringPayments(ids: $ids) { success } }`;
const DELETE_ONE_OFF = `mutation ($ids: [ID!]!) { batchDeleteOneOffPayments(ids: $ids) { success } }`;

const apiDate = (iso: string) => String(new Date(iso).getTime());
const records = () => mongoose.model('PaymentRecord');

// A £100 monthly expense due 31 Jan 2030, unless the fields say otherwise
const recurring = async (token: string, accountId: string, extra: Variables = {}) =>
  (
    await gql(
      CREATE,
      {
        input: {
          accountId,
          name: 'Credit card',
          amount: 100,
          category: 'CREDIT_CARD',
          frequency: 'MONTHLY',
          type: 'EXPENSE',
          firstPaymentDate: '2030-01-31',
          ...extra
        }
      },
      token
    )
  ).data.createRecurringPayment.recurringPayment;

const oneOff = async (token: string, accountId: string, name: string, dueDate = '2030-01-10') =>
  (
    await gql(
      ONE_OFF,
      { input: { accountId, name, amount: 40, dueDate, type: 'EXPENSE', category: 'OTHER' } },
      token
    )
  ).data.createOneOffPayment.oneOffPayment.id as string;

const pay = (token: string, accountId: string, recurringPaymentIds: string[], oneOffPaymentIds: string[] = []) =>
  gql(PAID, { input: { accountId, recurringPaymentIds, oneOffPaymentIds } }, token);
const unpay = (token: string, accountId: string, recurringPaymentIds: string[], oneOffPaymentIds?: string[]) =>
  gql(UNPAID, { input: { accountId, recurringPaymentIds, oneOffPaymentIds } }, token);
const startCycle = (token: string, accountId: string, payday: string) =>
  gql(START, { input: { accountId, payday, bankBalance: 1000, recurringPaymentIds: [] } }, token);

const accountIn = (body: GqlBody) => {
  expect(body.errors).toBeUndefined();
  return Object.values(body.data as Record<string, { account?: unknown }>)[0].account ?? body.data.account;
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const onlyPayment = (body: GqlBody): any => (accountIn(body) as any).recurringPayments[0];

const card = { balance: 1200, apr: 12 };

describe('payment history', () => {
  it('records each pay, skip, overpayment and balance change, newest first', async () => {
    const { token, accountId } = await createUserWithAccount();
    const payment = await recurring(token, accountId, { debt: card });
    await pay(token, accountId, [payment.id]);
    await gql(SKIP, { input: { accountId, recurringPaymentIds: [payment.id] } }, token);
    await gql(OVERPAY, { input: { accountId, recurringPaymentId: payment.id, amount: 50 } }, token);

    const { history } = onlyPayment(await gql(ACCOUNT_QUERY, {}, token));

    expect(history.map((record: { kind: string }) => record.kind)).toEqual([
      'OVERPAYMENT',
      'SKIPPED',
      'PAID',
      'BALANCE_SET'
    ]);
    expect(history[2]).toMatchObject({
      dates: [apiDate('2030-01-31')],
      balanceChange: -100,
      open: true,
      debt: { interest: 12, reduction: 88, balanceAfter: 1112 }
    });
    expect(history[0]).toMatchObject({ balanceChange: -50, debt: { reduction: 50, balanceAfter: 1062 } });
    expect(history[3]).toMatchObject({ balanceChange: 0, debt: { reduction: 0, balanceAfter: 1200 } });
  });

  it('keeps the latest ones when given a limit', async () => {
    const { token, accountId } = await createUserWithAccount();
    const payment = await recurring(token, accountId, { frequency: 'WEEKLY', firstPaymentDate: '2030-01-07' });
    for (let i = 0; i < 3; i += 1) await pay(token, accountId, [payment.id]);

    const body = await gql(`query { account { recurringPayments { history(limit: 2) { dates } } } }`, {}, token);

    expect(body.data.account.recurringPayments[0].history).toEqual([
      { dates: [apiDate('2030-01-21')] },
      { dates: [apiDate('2030-01-14')] }
    ]);
  });

  it('notes a balance set from a statement, and how far it moved', async () => {
    const { token, accountId } = await createUserWithAccount();
    const payment = await recurring(token, accountId, { debt: card });

    const body = await gql(UPDATE, { id: payment.id, input: { debt: { ...card, balance: 1150 } } }, token);

    const [latest] = body.data.updateRecurringPayment.recurringPayment.history;
    expect(latest).toMatchObject({ kind: 'BALANCE_SET', debt: { reduction: 50, balanceAfter: 1150 } });
  });

  it("doesn't note a balance when only the rate changes", async () => {
    const { token, accountId } = await createUserWithAccount();
    const payment = await recurring(token, accountId, { debt: card });

    const body = await gql(UPDATE, { id: payment.id, input: { debt: { ...card, apr: 20 } } }, token);

    expect(body.data.updateRecurringPayment.recurringPayment.history).toHaveLength(1);
  });

  it('keeps the history when it stops being tracked as a debt', async () => {
    const { token, accountId } = await createUserWithAccount();
    const payment = await recurring(token, accountId, { debt: card });
    await pay(token, accountId, [payment.id]);

    const body = await gql(UPDATE, { id: payment.id, input: { debt: null } }, token);

    expect(body.data.updateRecurringPayment.recurringPayment.history).toHaveLength(2);
  });

  it('leaves nothing behind when a payment is undone', async () => {
    const { token, accountId } = await createUserWithAccount();
    const payment = await recurring(token, accountId);
    await pay(token, accountId, [payment.id]);

    const undone = onlyPayment(await unpay(token, accountId, [payment.id]));

    expect(undone).toMatchObject({ thisCycle: [], history: [] });
  });

  it("reads one payment's history on its own", async () => {
    const { token, accountId } = await createUserWithAccount();
    const payment = await recurring(token, accountId, { debt: card });
    await pay(token, accountId, [payment.id]);

    const body = await gql(
      `query ($id: ID!) { recurringPayment(id: $id) { id name ${HISTORY} } }`,
      { id: payment.id },
      token
    );

    expect(body.errors).toBeUndefined();
    expect(body.data.recurringPayment).toMatchObject({ id: payment.id, name: 'Credit card' });
    expect(body.data.recurringPayment.history.map((record: { kind: string }) => record.kind)).toEqual([
      'PAID',
      'BALANCE_SET'
    ]);
  });

  it("won't read another user's payment, or one that doesn't exist", async () => {
    const owner = await createUserWithAccount();
    const payment = await recurring(owner.token, owner.accountId);
    const other = await createUserWithAccount();
    const query = `query ($id: ID!) { recurringPayment(id: $id) { id } }`;

    expect(errorCode(await gql(query, { id: payment.id }, other.token))).toBe('FORBIDDEN');
    expect(errorCode(await gql(query, { id: 'nope' }, owner.token))).toBe('RECURRING_PAYMENT_NOT_FOUND');
    expect(errorCode(await gql(query, { id: payment.id }))).toBe('UNAUTHENTICATED');
  });
});

describe('payday', () => {
  it('closes the cycle: its records stay as history but can no longer be undone', async () => {
    const { token, accountId } = await createUserWithAccount();
    const payment = await recurring(token, accountId);
    await pay(token, accountId, [payment.id]);
    await startCycle(token, accountId, '2030-02-27');

    const afterPayday = onlyPayment(await unpay(token, accountId, [payment.id]));

    expect(afterPayday.thisCycle).toEqual([]);
    expect(afterPayday.history).toEqual([expect.objectContaining({ kind: 'PAID', open: false })]);
    expect(afterPayday.nextDueDate).toBe(apiDate('2030-02-28'));
  });

  it('keeps open anything already dealt with from payday on', async () => {
    const { token, accountId } = await createUserWithAccount();
    const payment = await recurring(token, accountId);
    await pay(token, accountId, [payment.id]);

    const account = accountIn(await startCycle(token, accountId, '2030-01-30'));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((account as any).recurringPayments[0].thisCycle).toEqual([
      { kind: 'PAID', dates: [apiDate('2030-01-31')] }
    ]);
  });

  it('clears away paid one-offs due before it, keeping unpaid and later ones', async () => {
    const { token, accountId } = await createUserWithAccount();
    const paid = await oneOff(token, accountId, 'Gift');
    const unpaid = await oneOff(token, accountId, 'Repair');
    const later = await oneOff(token, accountId, 'Tickets', '2030-03-05');
    await pay(token, accountId, [], [paid, later]);

    const account = accountIn(await startCycle(token, accountId, '2030-02-01'));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((account as any).oneOffPayments.map((payment: { id: string }) => payment.id).sort()).toEqual(
      [unpaid, later].sort()
    );
    // The cleared one-off's record stays as history
    expect(await records().countDocuments({ 'payment.name': 'Gift', open: false })).toBe(1);
  });
});

describe('one-off payments', () => {
  it('are marked paid rather than deleted, and only come off the balance once', async () => {
    const { token, accountId } = await createUserWithAccount();
    const gift = await oneOff(token, accountId, 'Gift');
    await pay(token, accountId, [], [gift]);

    const again = accountIn(await pay(token, accountId, [], [gift]));

    expect(again).toMatchObject({ bankBalance: 960, oneOffPayments: [{ id: gift, paidAt: expect.any(String) }] });
  });

  it('can be made unpaid again, putting the money back', async () => {
    const { token, accountId } = await createUserWithAccount();
    const gift = await oneOff(token, accountId, 'Gift');
    await pay(token, accountId, [], [gift]);

    const account = accountIn(await unpay(token, accountId, [], [gift]));

    expect(account).toMatchObject({ bankBalance: 1000, oneOffPayments: [{ id: gift, paidAt: null }] });
    expect(await records().countDocuments()).toBe(0);
  });

  it('are removed completely when deleted, record and all, without touching the balance', async () => {
    const { token, accountId } = await createUserWithAccount();
    const gift = await oneOff(token, accountId, 'Gift');
    await pay(token, accountId, [], [gift]);

    await gql(DELETE_ONE_OFF, { ids: [gift] }, token);

    expect(await records().countDocuments()).toBe(0);
    expect(accountIn(await gql(ACCOUNT_QUERY, {}, token))).toMatchObject({ bankBalance: 960, oneOffPayments: [] });
  });
});

describe('undoDebtOverpayment', () => {
  const overpay = async (token: string, accountId: string, id: string) => {
    const payment = onlyPayment(
      await gql(OVERPAY, { input: { accountId, recurringPaymentId: id, amount: 200 } }, token)
    );
    return payment.history[0].id as string;
  };
  const undo = (token: string, accountId: string, recordId: string) =>
    gql(UNDO_OVERPAY, { input: { accountId, recordId } }, token);

  it('puts it back on the debt and the bank balance, leaving no record', async () => {
    const { token, accountId } = await createUserWithAccount();
    const payment = await recurring(token, accountId, { debt: card });
    const recordId = await overpay(token, accountId, payment.id);

    const body = await undo(token, accountId, recordId);

    expect(accountIn(body)).toMatchObject({ bankBalance: 1000 });
    expect(onlyPayment(body)).toMatchObject({ debt: { balance: 1200 } });
    expect(onlyPayment(body).history.map((record: { kind: string }) => record.kind)).toEqual(['BALANCE_SET']);
  });

  it("can't take back one from before the last payday", async () => {
    const { token, accountId } = await createUserWithAccount();
    const payment = await recurring(token, accountId, { debt: card });
    const recordId = await overpay(token, accountId, payment.id);
    await records().updateMany({}, { $set: { open: false } });

    expect(errorCode(await undo(token, accountId, recordId))).toBe('PAYMENT_RECORD_CLOSED');
  });

  it('only takes back overpayments', async () => {
    const { token, accountId } = await createUserWithAccount();
    const payment = await recurring(token, accountId, { debt: card });
    const paid = onlyPayment(await pay(token, accountId, [payment.id]));

    expect(errorCode(await undo(token, accountId, paid.history[0].id))).toBe('PAYMENT_RECORD_NOT_FOUND');
  });

  it("can't touch someone else's", async () => {
    const owner = await createUserWithAccount();
    const payment = await recurring(owner.token, owner.accountId, { debt: card });
    const recordId = await overpay(owner.token, owner.accountId, payment.id);
    const other = await createUserWithAccount();

    expect(errorCode(await undo(other.token, owner.accountId, recordId))).toBe('FORBIDDEN');
    expect(errorCode(await undo(other.token, other.accountId, recordId))).toBe('PAYMENT_RECORD_NOT_FOUND');
  });
});

describe('records follow their payment', () => {
  it('are closed, not counted as paid, when the schedule changes', async () => {
    const { token, accountId } = await createUserWithAccount();
    const payment = await recurring(token, accountId);
    await pay(token, accountId, [payment.id]);

    const body = await gql(UPDATE, { id: payment.id, input: { frequency: 'WEEKLY' } }, token);

    const updated = body.data.updateRecurringPayment.recurringPayment;
    expect(updated.thisCycle).toEqual([]);
    expect(updated.history).toEqual([expect.objectContaining({ kind: 'PAID', open: false })]);
  });

  it('go when the payment is deleted', async () => {
    const { token, accountId } = await createUserWithAccount();
    const payment = await recurring(token, accountId, { debt: card });
    await pay(token, accountId, [payment.id]);

    await gql(DELETE_RECURRING, { ids: [payment.id] }, token);

    expect(await records().countDocuments()).toBe(0);
  });

  it('go when the account is deleted', async () => {
    const { token, accountId } = await createUserWithAccount();
    const payment = await recurring(token, accountId);
    await pay(token, accountId, [payment.id]);

    await gql(`mutation { deleteCurrentUser { success } }`, {}, token);

    expect(await records().countDocuments()).toBe(0);
  });
});

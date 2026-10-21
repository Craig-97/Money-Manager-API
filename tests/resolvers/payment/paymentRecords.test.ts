import mongoose from 'mongoose';
import {
  setupTestApp,
  teardownTestApp,
  clearDatabase,
  gql,
  errorCode,
  createUserWithBudget,
  GqlBody,
  Variables
} from '../../helpers';

beforeAll(setupTestApp);
afterAll(teardownTestApp);
beforeEach(clearDatabase);

const HISTORY = 'history { id kind dates balanceChange open debt { interest reduction balanceAfter } }';
const RECURRING = `id name nextDueDate thisCycle { kind dates } debt { balance } ${HISTORY}`;
const BUDGET = `budget { bankBalance recurringPayments { ${RECURRING} } oneOffPayments { id name paidAt } }`;

const CREATE = `mutation ($input: CreateRecurringPaymentInput!) {
  createRecurringPayment(input: $input) { recurringPayment { ${RECURRING} } }
}`;
const UPDATE = `mutation ($id: ID!, $input: UpdateRecurringPaymentInput!) {
  updateRecurringPayment(id: $id, input: $input) { recurringPayment { ${RECURRING} } }
}`;
const ONE_OFF = `mutation ($input: CreateOneOffPaymentInput!) {
  createOneOffPayment(input: $input) { oneOffPayment { id } }
}`;
const PAID = `mutation ($input: MarkPaymentsPaidInput!) { markPaymentsPaid(input: $input) { ${BUDGET} } }`;
const UNPAID = `mutation ($input: MarkPaymentsUnpaidInput!) { markPaymentsUnpaid(input: $input) { ${BUDGET} } }`;
const SKIP = `mutation ($input: SkipRecurringPaymentsInput!) { skipRecurringPayments(input: $input) { ${BUDGET} } }`;
const OVERPAY = `mutation ($input: LogDebtOverpaymentInput!) { logDebtOverpayment(input: $input) { ${BUDGET} } }`;
const UNDO_OVERPAY = `mutation ($input: UndoDebtOverpaymentInput!) { undoDebtOverpayment(input: $input) { ${BUDGET} } }`;
const START = `mutation ($input: StartPaydayCycleInput!) { startPaydayCycle(input: $input) { ${BUDGET} } }`;
const BUDGET_QUERY = `query { ${BUDGET} }`;
const DELETE_RECURRING = `mutation ($ids: [ID!]!) { batchDeleteRecurringPayments(ids: $ids) { success } }`;
const DELETE_ONE_OFF = `mutation ($ids: [ID!]!) { batchDeleteOneOffPayments(ids: $ids) { success } }`;

const apiDate = (iso: string) => String(new Date(iso).getTime());
const records = () => mongoose.model('PaymentRecord');

// A £100 monthly expense due 31 Jan 2030, unless the fields say otherwise
const recurring = async (token: string, budgetId: string, extra: Variables = {}) =>
  (
    await gql(
      CREATE,
      {
        input: {
          budgetId,
          name: 'Credit card',
          amount: 100,
          category: 'FINANCES',
          frequency: 'MONTHLY',
          type: 'EXPENSE',
          firstPaymentDate: '2030-01-31',
          ...extra
        }
      },
      token
    )
  ).data.createRecurringPayment.recurringPayment;

const oneOff = async (token: string, budgetId: string, name: string, dueDate = '2030-01-10') =>
  (
    await gql(
      ONE_OFF,
      { input: { budgetId, name, amount: 40, dueDate, type: 'EXPENSE', category: 'GENERAL' } },
      token
    )
  ).data.createOneOffPayment.oneOffPayment.id as string;

const pay = (token: string, budgetId: string, recurringPaymentIds: string[], oneOffPaymentIds: string[] = []) =>
  gql(PAID, { input: { budgetId, recurringPaymentIds, oneOffPaymentIds } }, token);
const unpay = (token: string, budgetId: string, recurringPaymentIds: string[], oneOffPaymentIds?: string[]) =>
  gql(UNPAID, { input: { budgetId, recurringPaymentIds, oneOffPaymentIds } }, token);
const startCycle = (token: string, budgetId: string, payday: string) =>
  gql(START, { input: { budgetId, payday, paidIntoBalance: 1000, leftOver: [] } }, token);

const budgetIn = (body: GqlBody) => {
  expect(body.errors).toBeUndefined();
  return Object.values(body.data as Record<string, { budget?: unknown }>)[0].budget ?? body.data.budget;
};
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const onlyPayment = (body: GqlBody): any => (budgetIn(body) as any).recurringPayments[0];

const card = { balance: 1200, apr: 12 };

describe('payment history', () => {
  it('records each pay, skip, overpayment and balance change, newest first', async () => {
    const { token, budgetId } = await createUserWithBudget();
    const payment = await recurring(token, budgetId, { debt: card });
    await pay(token, budgetId, [payment.id]);
    await gql(SKIP, { input: { budgetId, recurringPaymentIds: [payment.id] } }, token);
    await gql(OVERPAY, { input: { budgetId, recurringPaymentId: payment.id, amount: 50 } }, token);

    const { history } = onlyPayment(await gql(BUDGET_QUERY, {}, token));

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
    const { token, budgetId } = await createUserWithBudget();
    const payment = await recurring(token, budgetId, { frequency: 'WEEKLY', firstPaymentDate: '2030-01-07' });
    for (let i = 0; i < 3; i += 1) await pay(token, budgetId, [payment.id]);

    const body = await gql(`query { budget { recurringPayments { history(limit: 2) { dates } } } }`, {}, token);

    expect(body.data.budget.recurringPayments[0].history).toEqual([
      { dates: [apiDate('2030-01-21')] },
      { dates: [apiDate('2030-01-14')] }
    ]);
  });

  it('notes a balance set from a statement, and how far it moved', async () => {
    const { token, budgetId } = await createUserWithBudget();
    const payment = await recurring(token, budgetId, { debt: card });

    const body = await gql(UPDATE, { id: payment.id, input: { debt: { ...card, balance: 1150 } } }, token);

    const [latest] = body.data.updateRecurringPayment.recurringPayment.history;
    expect(latest).toMatchObject({ kind: 'BALANCE_SET', debt: { reduction: 50, balanceAfter: 1150 } });
  });

  it("doesn't note a balance when only the rate changes", async () => {
    const { token, budgetId } = await createUserWithBudget();
    const payment = await recurring(token, budgetId, { debt: card });

    const body = await gql(UPDATE, { id: payment.id, input: { debt: { ...card, apr: 20 } } }, token);

    expect(body.data.updateRecurringPayment.recurringPayment.history).toHaveLength(1);
  });

  it('keeps the history when it stops being tracked as a debt', async () => {
    const { token, budgetId } = await createUserWithBudget();
    const payment = await recurring(token, budgetId, { debt: card });
    await pay(token, budgetId, [payment.id]);

    const body = await gql(UPDATE, { id: payment.id, input: { debt: null } }, token);

    expect(body.data.updateRecurringPayment.recurringPayment.history).toHaveLength(2);
  });

  it('leaves nothing behind when a payment is undone', async () => {
    const { token, budgetId } = await createUserWithBudget();
    const payment = await recurring(token, budgetId);
    await pay(token, budgetId, [payment.id]);

    const undone = onlyPayment(await unpay(token, budgetId, [payment.id]));

    expect(undone).toMatchObject({ thisCycle: [], history: [] });
  });

  it("reads one payment's history on its own", async () => {
    const { token, budgetId } = await createUserWithBudget();
    const payment = await recurring(token, budgetId, { debt: card });
    await pay(token, budgetId, [payment.id]);

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
    const owner = await createUserWithBudget();
    const payment = await recurring(owner.token, owner.budgetId);
    const other = await createUserWithBudget();
    const query = `query ($id: ID!) { recurringPayment(id: $id) { id } }`;

    expect(errorCode(await gql(query, { id: payment.id }, other.token))).toBe('FORBIDDEN');
    expect(errorCode(await gql(query, { id: 'nope' }, owner.token))).toBe('RECURRING_PAYMENT_NOT_FOUND');
    expect(errorCode(await gql(query, { id: payment.id }))).toBe('UNAUTHENTICATED');
  });
});

describe('paid off since payday', () => {
  const PAID_OFF = `query { budget { recurringPayments { debt { paidOffThisCycle } } } }`;
  const paidOff = async (token: string) =>
    (await gql(PAID_OFF, {}, token)).data.budget.recurringPayments[0].debt.paidOffThisCycle;

  it('counts what payments took off after interest, and overpayments, until payday', async () => {
    const { token, budgetId } = await createUserWithBudget();
    const payment = await recurring(token, budgetId, { debt: card });
    // Setting the balance doesn't count as paying it off
    expect(await paidOff(token)).toBe(0);

    // £100 less a month's interest at 12% on £1,200
    await pay(token, budgetId, [payment.id]);
    expect(await paidOff(token)).toBe(88);

    const overpaid = onlyPayment(
      await gql(OVERPAY, { input: { budgetId, recurringPaymentId: payment.id, amount: 50 } }, token)
    );
    expect(await paidOff(token)).toBe(138);

    await gql(UNDO_OVERPAY, { input: { budgetId, recordId: overpaid.history[0].id } }, token);
    expect(await paidOff(token)).toBe(88);

    await startCycle(token, budgetId, '2030-02-27');
    expect(await paidOff(token)).toBe(0);
  });

  it('is there on a payment read on its own', async () => {
    const { token, budgetId } = await createUserWithBudget();
    const payment = await recurring(token, budgetId, { debt: card });
    await pay(token, budgetId, [payment.id]);

    const body = await gql(
      `query ($id: ID!) { recurringPayment(id: $id) { debt { paidOffThisCycle } } }`,
      { id: payment.id },
      token
    );

    expect(body.data.recurringPayment.debt.paidOffThisCycle).toBe(88);
  });
});

describe('payday', () => {
  it('closes the cycle: its records stay as history but can no longer be undone', async () => {
    const { token, budgetId } = await createUserWithBudget();
    const payment = await recurring(token, budgetId);
    await pay(token, budgetId, [payment.id]);
    await startCycle(token, budgetId, '2030-02-27');

    const afterPayday = onlyPayment(await unpay(token, budgetId, [payment.id]));

    expect(afterPayday.thisCycle).toEqual([]);
    expect(afterPayday.history).toEqual([expect.objectContaining({ kind: 'PAID', open: false })]);
    expect(afterPayday.nextDueDate).toBe(apiDate('2030-02-28'));
  });

  it('keeps open anything already dealt with from payday on', async () => {
    const { token, budgetId } = await createUserWithBudget();
    const payment = await recurring(token, budgetId);
    await pay(token, budgetId, [payment.id]);

    const budget = budgetIn(await startCycle(token, budgetId, '2030-01-30'));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((budget as any).recurringPayments[0].thisCycle).toEqual([
      { kind: 'PAID', dates: [apiDate('2030-01-31')] }
    ]);
  });

  it('clears away paid one-offs due before it, keeping unpaid and later ones', async () => {
    const { token, budgetId } = await createUserWithBudget();
    const paid = await oneOff(token, budgetId, 'Gift');
    const unpaid = await oneOff(token, budgetId, 'Repair');
    const later = await oneOff(token, budgetId, 'Tickets', '2030-03-05');
    await pay(token, budgetId, [], [paid, later]);

    const budget = budgetIn(await startCycle(token, budgetId, '2030-02-01'));

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    expect((budget as any).oneOffPayments.map((payment: { id: string }) => payment.id).sort()).toEqual(
      [unpaid, later].sort()
    );
    // The cleared one-off's record stays as history
    expect(await records().countDocuments({ 'payment.name': 'Gift', open: false })).toBe(1);
  });
});

describe('one-off payments', () => {
  it('are marked paid rather than deleted, and only come off the balance once', async () => {
    const { token, budgetId } = await createUserWithBudget();
    const gift = await oneOff(token, budgetId, 'Gift');
    await pay(token, budgetId, [], [gift]);

    const again = budgetIn(await pay(token, budgetId, [], [gift]));

    expect(again).toMatchObject({ bankBalance: 960, oneOffPayments: [{ id: gift, paidAt: expect.any(String) }] });
  });

  it('can be made unpaid again, putting the money back', async () => {
    const { token, budgetId } = await createUserWithBudget();
    const gift = await oneOff(token, budgetId, 'Gift');
    await pay(token, budgetId, [], [gift]);

    const budget = budgetIn(await unpay(token, budgetId, [], [gift]));

    expect(budget).toMatchObject({ bankBalance: 1000, oneOffPayments: [{ id: gift, paidAt: null }] });
    expect(await records().countDocuments()).toBe(0);
  });

  it('are removed completely when deleted, record and all, without touching the balance', async () => {
    const { token, budgetId } = await createUserWithBudget();
    const gift = await oneOff(token, budgetId, 'Gift');
    await pay(token, budgetId, [], [gift]);

    await gql(DELETE_ONE_OFF, { ids: [gift] }, token);

    expect(await records().countDocuments()).toBe(0);
    expect(budgetIn(await gql(BUDGET_QUERY, {}, token))).toMatchObject({ bankBalance: 960, oneOffPayments: [] });
  });
});

describe('undoDebtOverpayment', () => {
  const overpay = async (token: string, budgetId: string, id: string) => {
    const payment = onlyPayment(
      await gql(OVERPAY, { input: { budgetId, recurringPaymentId: id, amount: 200 } }, token)
    );
    return payment.history[0].id as string;
  };
  const undo = (token: string, budgetId: string, recordId: string) =>
    gql(UNDO_OVERPAY, { input: { budgetId, recordId } }, token);

  it('puts it back on the debt and the bank balance, leaving no record', async () => {
    const { token, budgetId } = await createUserWithBudget();
    const payment = await recurring(token, budgetId, { debt: card });
    const recordId = await overpay(token, budgetId, payment.id);

    const body = await undo(token, budgetId, recordId);

    expect(budgetIn(body)).toMatchObject({ bankBalance: 1000 });
    expect(onlyPayment(body)).toMatchObject({ debt: { balance: 1200 } });
    expect(onlyPayment(body).history.map((record: { kind: string }) => record.kind)).toEqual(['BALANCE_SET']);
  });

  it("can't take back one from before the last payday", async () => {
    const { token, budgetId } = await createUserWithBudget();
    const payment = await recurring(token, budgetId, { debt: card });
    const recordId = await overpay(token, budgetId, payment.id);
    await records().updateMany({}, { $set: { open: false } });

    expect(errorCode(await undo(token, budgetId, recordId))).toBe('PAYMENT_RECORD_CLOSED');
  });

  it('only takes back overpayments', async () => {
    const { token, budgetId } = await createUserWithBudget();
    const payment = await recurring(token, budgetId, { debt: card });
    const paid = onlyPayment(await pay(token, budgetId, [payment.id]));

    expect(errorCode(await undo(token, budgetId, paid.history[0].id))).toBe('PAYMENT_RECORD_NOT_FOUND');
  });

  it("can't touch someone else's", async () => {
    const owner = await createUserWithBudget();
    const payment = await recurring(owner.token, owner.budgetId, { debt: card });
    const recordId = await overpay(owner.token, owner.budgetId, payment.id);
    const other = await createUserWithBudget();

    expect(errorCode(await undo(other.token, owner.budgetId, recordId))).toBe('FORBIDDEN');
    expect(errorCode(await undo(other.token, other.budgetId, recordId))).toBe('PAYMENT_RECORD_NOT_FOUND');
  });
});

describe('records follow their payment', () => {
  it('are closed, not counted as paid, when the schedule changes', async () => {
    const { token, budgetId } = await createUserWithBudget();
    const payment = await recurring(token, budgetId);
    await pay(token, budgetId, [payment.id]);

    const body = await gql(UPDATE, { id: payment.id, input: { frequency: 'WEEKLY' } }, token);

    const updated = body.data.updateRecurringPayment.recurringPayment;
    expect(updated.thisCycle).toEqual([]);
    expect(updated.history).toEqual([expect.objectContaining({ kind: 'PAID', open: false })]);
  });

  it('go when the payment is deleted', async () => {
    const { token, budgetId } = await createUserWithBudget();
    const payment = await recurring(token, budgetId, { debt: card });
    await pay(token, budgetId, [payment.id]);

    await gql(DELETE_RECURRING, { ids: [payment.id] }, token);

    expect(await records().countDocuments()).toBe(0);
  });

  it('go when the budget is deleted', async () => {
    const { token, budgetId } = await createUserWithBudget();
    const payment = await recurring(token, budgetId);
    await pay(token, budgetId, [payment.id]);

    await gql(`mutation { deleteCurrentUser { success } }`, {}, token);

    expect(await records().countDocuments()).toBe(0);
  });
});

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

const FIELDS =
  'id name amount category frequency type firstPaymentDate lastPaymentDate renewalDate dueReminder { off days } renewalReminder { off days } budget';
const CREATE = `mutation ($input: CreateRecurringPaymentInput!) {
  createRecurringPayment(input: $input) { success recurringPayment { ${FIELDS} } }
}`;
const UNKNOWN = '507f1f77bcf86cd799439011';

const makePayment = (token: string | undefined, budgetId: string, name: string, extra: Variables = {}) =>
  gql(
    CREATE,
    {
      input: {
        budgetId,
        name,
        amount: 10,
        category: 'SUBSCRIPTIONS',
        frequency: 'MONTHLY',
        type: 'EXPENSE',
        firstPaymentDate: '2030-01-01',
        ...extra
      }
    },
    token
  );

const idOf = (body: GqlBody) => body.data.createRecurringPayment.recurringPayment.id;

describe('createRecurringPayment', () => {
  it('creates a payment and adds it to the budget', async () => {
    const { token, budgetId } = await createUserWithBudget();
    const body = await makePayment(token, budgetId, 'Netflix', { amount: 9.99 });
    expect(body.errors).toBeUndefined();
    const { success, recurringPayment } = body.data.createRecurringPayment;
    expect(success).toBe(true);
    expect(recurringPayment).toMatchObject({
      name: 'Netflix',
      amount: 9.99,
      category: 'SUBSCRIPTIONS',
      frequency: 'MONTHLY',
      type: 'EXPENSE',
      budget: budgetId,
      lastPaymentDate: null
    });
    // Date fields are exposed through GraphQL String, which serializes as epoch milliseconds
    expect(recurringPayment.firstPaymentDate).toBe(String(new Date('2030-01-01').getTime()));
    const budget = await mongoose.model('Budget').findById(budgetId).populate('recurringPayments');
    expect(budget.recurringPayments.map((r: { id: string }) => r.id)).toEqual([recurringPayment.id]);
  });

  it('keeps going with no renewal unless one is given', async () => {
    const { token, budgetId } = await createUserWithBudget();
    const body = await makePayment(token, budgetId, 'Gym');
    expect(body.data.createRecurringPayment.recurringPayment).toMatchObject({
      renewalDate: null,
      // Both follow the budget's usual timing
      dueReminder: { off: false, days: null },
      renewalReminder: { off: false, days: null }
    });
  });

  it('saves a renewal and its reminder', async () => {
    const { token, budgetId } = await createUserWithBudget();
    const body = await makePayment(token, budgetId, 'Home insurance', {
      renewalDate: '2031-01-01',
      renewalReminder: { off: false, days: 30 }
    });
    expect(body.errors).toBeUndefined();
    expect(body.data.createRecurringPayment.recurringPayment).toMatchObject({
      renewalDate: String(new Date('2031-01-01').getTime()),
      renewalReminder: { off: false, days: 30 }
    });
  });

  it.each([
    ['a renewal reminder that is not one of the choices', { renewalReminder: { off: false, days: 10 } }],
    ['a due reminder that is not one of the choices', { dueReminder: { off: false, days: 2 } }],
    ['a reminder that is off with days', { dueReminder: { off: true, days: 1 } }],
    ['a renewal and a last payment together', { renewalDate: '2031-01-01', lastPaymentDate: '2031-06-01' }],
    ['a renewal date on a yearly payment', { renewalDate: '2031-01-01', frequency: 'ANNUALLY' }],
    ['a renewal on or before the first payment', { renewalDate: '2030-01-01' }]
  ])('rejects %s', async (_, extra) => {
    const { token, budgetId } = await createUserWithBudget();
    const body = await makePayment(token, budgetId, 'Bad', extra);
    expect(errorCode(body)).toBe('BAD_USER_INPUT');
  });

  it('allows a reminder on a yearly payment, counted back from each payment', async () => {
    const { token, budgetId } = await createUserWithBudget();
    const body = await makePayment(token, budgetId, 'Car insurance', {
      frequency: 'ANNUALLY',
      renewalReminder: { off: false, days: 30 }
    });
    expect(body.errors).toBeUndefined();
  });

  it('rejects a duplicate name', async () => {
    const { token, budgetId } = await createUserWithBudget();
    await makePayment(token, budgetId, 'Dup');
    const body = await makePayment(token, budgetId, 'Dup');
    expect(errorCode(body)).toBe('PAYMENT_EXISTS');
  });

  it('rejects a name used by a one-off payment', async () => {
    const { token, budgetId } = await createUserWithBudget();
    await gql(
      `mutation ($input: CreateOneOffPaymentInput!) { createOneOffPayment(input: $input) { success } }`,
      {
        input: { budgetId, name: 'Shared', amount: 1, dueDate: '2030-06-15', type: 'EXPENSE', category: 'GROCERIES' }
      },
      token
    );
    const body = await makePayment(token, budgetId, 'Shared');
    expect(errorCode(body)).toBe('PAYMENT_EXISTS');
  });

  it('returns FORBIDDEN for another users budget', async () => {
    const owner = await createUserWithBudget();
    const other = await createUserWithBudget();
    const body = await makePayment(other.token, owner.budgetId, 'Sneaky');
    expect(errorCode(body)).toBe('FORBIDDEN');
  });

  it('requires authentication', async () => {
    const { budgetId } = await createUserWithBudget();
    const body = await makePayment(undefined, budgetId, 'x');
    expect(errorCode(body)).toBe('UNAUTHENTICATED');
  });
});

describe('reading recurring payments', () => {
  it("lists them on the user's budget, sorted by amount", async () => {
    const { token, budgetId } = await createUserWithBudget();
    await makePayment(token, budgetId, 'Big', { amount: 900 });
    await makePayment(token, budgetId, 'Small', { amount: 5 });
    const body = await gql(`query { budget { recurringPayments { name amount } } }`, undefined, token);
    expect(body.errors).toBeUndefined();
    expect(body.data.budget.recurringPayments.map((p: { name: string }) => p.name)).toEqual(['Small', 'Big']);
  });
});

describe('updateRecurringPayment', () => {
  const UPDATE = `mutation ($id: ID!, $input: UpdateRecurringPaymentInput!) {
    updateRecurringPayment(id: $id, input: $input) { success recurringPayment { ${FIELDS} } }
  }`;

  it('updates provided fields only', async () => {
    const { token, budgetId } = await createUserWithBudget();
    const created = await makePayment(token, budgetId, 'Edit me');
    const body = await gql(
      UPDATE,
      { id: idOf(created), input: { amount: 55, frequency: 'ANNUALLY' } },
      token
    );
    expect(body.errors).toBeUndefined();
    expect(body.data.updateRecurringPayment.recurringPayment).toMatchObject({
      name: 'Edit me',
      amount: 55,
      frequency: 'ANNUALLY',
      type: 'EXPENSE',
      budget: budgetId
    });
  });

  it('rejects an empty update', async () => {
    const { token, budgetId } = await createUserWithBudget();
    const created = await makePayment(token, budgetId, 'Edit me');
    const body = await gql(UPDATE, { id: idOf(created), input: {} }, token);
    expect(errorCode(body)).toBe('RECURRING_PAYMENT_UPDATE_FAILED');
  });

  it('rejects paid or skipped dates with a validation error, as only paying or skipping records them', async () => {
    const { token, budgetId } = await createUserWithBudget();
    const created = await makePayment(token, budgetId, 'Edit me');
    const thisCycle = [{ kind: 'PAID', dates: ['2030-01-01'] }];
    const body = await gql(UPDATE, { id: idOf(created), input: { thisCycle } }, token);
    expect(body.errors).toBeDefined();
    expect(body.data).toBeUndefined();
    const stored = await mongoose.model('RecurringPayment').findById(idOf(created));
    expect(stored).not.toBeNull();
    expect(await mongoose.model('PaymentRecord').countDocuments()).toBe(0);
  });

  it('rejects renaming to an existing recurring payment name', async () => {
    const { token, budgetId } = await createUserWithBudget();
    await makePayment(token, budgetId, 'First');
    const second = await makePayment(token, budgetId, 'Second');
    const body = await gql(UPDATE, { id: idOf(second), input: { name: 'First' } }, token);
    expect(errorCode(body)).toBe('RECURRING_PAYMENT_EXISTS');
  });

  it('sets and clears a renewal', async () => {
    const { token, budgetId } = await createUserWithBudget();
    const created = await makePayment(token, budgetId, 'Phone');
    const set = await gql(
      UPDATE,
      { id: idOf(created), input: { renewalDate: '2031-01-01', renewalReminder: { off: false, days: 14 } } },
      token
    );
    expect(set.errors).toBeUndefined();
    expect(set.data.updateRecurringPayment.recurringPayment).toMatchObject({
      renewalDate: String(new Date('2031-01-01').getTime()),
      renewalReminder: { off: false, days: 14 }
    });

    const cleared = await gql(UPDATE, { id: idOf(created), input: { renewalDate: null } }, token);
    expect(cleared.data.updateRecurringPayment.recurringPayment.renewalDate).toBeNull();
  });

  it('rejects a last payment on a payment that renews', async () => {
    const { token, budgetId } = await createUserWithBudget();
    const created = await makePayment(token, budgetId, 'Phone', { renewalDate: '2031-01-01' });
    const body = await gql(UPDATE, { id: idOf(created), input: { lastPaymentDate: '2031-06-01' } }, token);
    expect(errorCode(body)).toBe('BAD_USER_INPUT');
  });

  it('allows swapping a renewal for a last payment in one update', async () => {
    const { token, budgetId } = await createUserWithBudget();
    const created = await makePayment(token, budgetId, 'Phone', { renewalDate: '2031-01-01' });
    const body = await gql(
      UPDATE,
      { id: idOf(created), input: { renewalDate: null, lastPaymentDate: '2031-06-01' } },
      token
    );
    expect(body.errors).toBeUndefined();
  });

  it('rejects making a payment with a renewal date yearly', async () => {
    const { token, budgetId } = await createUserWithBudget();
    const created = await makePayment(token, budgetId, 'Phone', { renewalDate: '2031-01-01' });
    const body = await gql(UPDATE, { id: idOf(created), input: { frequency: 'ANNUALLY' } }, token);
    expect(errorCode(body)).toBe('BAD_USER_INPUT');
  });

  it('returns RECURRING_PAYMENT_NOT_FOUND for an unknown id', async () => {
    const { token } = await createUserWithBudget();
    const body = await gql(UPDATE, { id: UNKNOWN, input: { amount: 1 } }, token);
    expect(errorCode(body)).toBe('RECURRING_PAYMENT_NOT_FOUND');
  });

  it('returns FORBIDDEN for another users payment', async () => {
    const owner = await createUserWithBudget();
    const other = await createUserWithBudget();
    const created = await makePayment(owner.token, owner.budgetId, 'Private');
    const body = await gql(UPDATE, { id: idOf(created), input: { amount: 1 } }, other.token);
    expect(errorCode(body)).toBe('FORBIDDEN');
  });
});

describe('batchDeleteRecurringPayments', () => {
  const BATCH = `mutation ($ids: [ID!]!) { batchDeleteRecurringPayments(ids: $ids) { success deletedCount ids } }`;

  const createThree = async () => {
    const user = await createUserWithBudget();
    const ids = [];
    for (const name of ['A', 'B', 'C']) {
      ids.push(idOf(await makePayment(user.token, user.budgetId, name)));
    }
    return { ...user, ids };
  };

  it('deletes payments, pulls them from the budget and returns their ids', async () => {
    const { token, budgetId, ids } = await createThree();
    const body = await gql(BATCH, { ids: ids.slice(0, 2) }, token);
    expect(body.errors).toBeUndefined();
    expect(body.data.batchDeleteRecurringPayments).toEqual({
      success: true,
      deletedCount: 2,
      ids: ids.slice(0, 2)
    });
    expect(await mongoose.model('RecurringPayment').countDocuments()).toBe(1);
    const budget = await mongoose.model('Budget').findById(budgetId).populate('recurringPayments');
    expect(budget.recurringPayments.map((r: { id: string }) => r.id)).toEqual([ids[2]]);
  });

  it('fails when any payment is missing', async () => {
    const { token, ids } = await createThree();
    const body = await gql(BATCH, { ids: [ids[0], UNKNOWN] }, token);
    expect(errorCode(body)).toBe('RECURRING_PAYMENTS_NOT_FOUND');
    expect(await mongoose.model('RecurringPayment').countDocuments()).toBe(3);
  });

  it('returns FORBIDDEN for another users payments', async () => {
    const { ids } = await createThree();
    const other = await createUserWithBudget();
    const body = await gql(BATCH, { ids }, other.token);
    expect(errorCode(body)).toBe('FORBIDDEN');
    expect(await mongoose.model('RecurringPayment').countDocuments()).toBe(3);
  });
});

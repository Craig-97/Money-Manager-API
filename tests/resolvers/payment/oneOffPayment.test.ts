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

const FIELDS = 'id budget name amount dueDate type category';
const CREATE = `mutation ($input: CreateOneOffPaymentInput!) {
  createOneOffPayment(input: $input) { success oneOffPayment { ${FIELDS} } }
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
        dueDate: '2030-06-15',
        type: 'EXPENSE',
        category: 'GROCERIES',
        ...extra
      }
    },
    token
  );

const idOf = (body: GqlBody) => body.data.createOneOffPayment.oneOffPayment.id;

describe('createOneOffPayment', () => {
  it('creates a payment and adds it to the budget', async () => {
    const { token, budgetId } = await createUserWithBudget();
    const body = await makePayment(token, budgetId, 'Holiday', { amount: 250.75 });
    expect(body.errors).toBeUndefined();
    const { success, oneOffPayment } = body.data.createOneOffPayment;
    expect(success).toBe(true);
    expect(oneOffPayment).toMatchObject({
      budget: budgetId,
      name: 'Holiday',
      amount: 250.75,
      type: 'EXPENSE',
      category: 'GROCERIES'
    });
    // Date fields are exposed through GraphQL String, which serializes as epoch milliseconds
    expect(oneOffPayment.dueDate).toBe(String(new Date('2030-06-15').getTime()));
    const budget = await mongoose.model('Budget').findById(budgetId).populate('oneOffPayments');
    expect(budget.oneOffPayments.map((r: { id: string }) => r.id)).toEqual([oneOffPayment.id]);
  });

  it('rejects a duplicate name', async () => {
    const { token, budgetId } = await createUserWithBudget();
    await makePayment(token, budgetId, 'Dup');
    const body = await makePayment(token, budgetId, 'Dup');
    expect(errorCode(body)).toBe('PAYMENT_EXISTS');
  });

  it('rejects an enum value outside the schema with a validation error', async () => {
    const { token, budgetId } = await createUserWithBudget();
    const body = await makePayment(token, budgetId, 'Bad', { type: 'NOPE' });
    expect(body.errors).toBeDefined();
    expect(body.data).toBeUndefined();
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

describe('reading one-off payments', () => {
  it("lists them on the user's budget, sorted by amount", async () => {
    const { token, budgetId } = await createUserWithBudget();
    await makePayment(token, budgetId, 'Big', { amount: 900 });
    await makePayment(token, budgetId, 'Small', { amount: 5 });
    const body = await gql(`query { budget { oneOffPayments { name amount } } }`, undefined, token);
    expect(body.errors).toBeUndefined();
    expect(body.data.budget.oneOffPayments.map((p: { name: string }) => p.name)).toEqual(['Small', 'Big']);
  });
});

describe('updateOneOffPayment', () => {
  const UPDATE = `mutation ($id: ID!, $input: UpdateOneOffPaymentInput!) {
    updateOneOffPayment(id: $id, input: $input) { success oneOffPayment { ${FIELDS} } }
  }`;

  it('updates provided fields only', async () => {
    const { token, budgetId } = await createUserWithBudget();
    const created = await makePayment(token, budgetId, 'Edit me', { amount: 10 });
    const body = await gql(
      UPDATE,
      { id: idOf(created), input: { amount: 99, category: 'GIFTS' } },
      token
    );
    expect(body.errors).toBeUndefined();
    expect(body.data.updateOneOffPayment.oneOffPayment).toMatchObject({
      name: 'Edit me',
      amount: 99,
      category: 'GIFTS',
      type: 'EXPENSE'
    });
  });

  it('returns PAYMENT_NOT_FOUND for an unknown id', async () => {
    const { token } = await createUserWithBudget();
    const body = await gql(UPDATE, { id: UNKNOWN, input: { amount: 1 } }, token);
    expect(errorCode(body)).toBe('PAYMENT_NOT_FOUND');
  });

  it('returns FORBIDDEN for another users payment', async () => {
    const owner = await createUserWithBudget();
    const other = await createUserWithBudget();
    const created = await makePayment(owner.token, owner.budgetId, 'Private');
    const body = await gql(UPDATE, { id: idOf(created), input: { amount: 1 } }, other.token);
    expect(errorCode(body)).toBe('FORBIDDEN');
  });
});

describe('batchDeleteOneOffPayments', () => {
  const BATCH = `mutation ($ids: [ID!]!) {
    batchDeleteOneOffPayments(ids: $ids) { success deletedCount ids }
  }`;

  it('deletes payments, pulls them from the budget and returns their ids', async () => {
    const { token, budgetId } = await createUserWithBudget();
    const ids = [];
    for (const name of ['A', 'B', 'C']) {
      ids.push(idOf(await makePayment(token, budgetId, name)));
    }
    const body = await gql(BATCH, { ids: ids.slice(0, 2) }, token);
    expect(body.errors).toBeUndefined();
    expect(body.data.batchDeleteOneOffPayments).toEqual({
      success: true,
      deletedCount: 2,
      ids: ids.slice(0, 2)
    });
    expect(await mongoose.model('OneOffPayment').countDocuments()).toBe(1);
    const budget = await mongoose.model('Budget').findById(budgetId).populate('oneOffPayments');
    expect(budget.oneOffPayments.map((r: { id: string }) => r.id)).toEqual([ids[2]]);
  });

  it('fails when any payment is missing', async () => {
    const { token, budgetId } = await createUserWithBudget();
    const id = idOf(await makePayment(token, budgetId, 'A'));
    const body = await gql(BATCH, { ids: [id, UNKNOWN] }, token);
    expect(errorCode(body)).toBe('PAYMENTS_NOT_FOUND');
    expect(await mongoose.model('OneOffPayment').countDocuments()).toBe(1);
  });

  it('returns FORBIDDEN for another users payments', async () => {
    const owner = await createUserWithBudget();
    const other = await createUserWithBudget();
    const id = idOf(await makePayment(owner.token, owner.budgetId, 'A'));
    const body = await gql(BATCH, { ids: [id] }, other.token);
    expect(errorCode(body)).toBe('FORBIDDEN');
    expect(await mongoose.model('OneOffPayment').countDocuments()).toBe(1);
  });
});

describe('one-off reminders', () => {
  const TIMING = `mutation ($input: CreateOneOffPaymentInput!) {
    createOneOffPayment(input: $input) { oneOffPayment { id dueReminder { off days } } }
  }`;
  const UPDATE_TIMING = `mutation ($id: ID!, $input: UpdateOneOffPaymentInput!) {
    updateOneOffPayment(id: $id, input: $input) { oneOffPayment { dueReminder { off days } } }
  }`;
  const input = (budgetId: string, extra: Variables = {}) => ({
    input: { budgetId, name: 'Birthday', amount: 75, dueDate: '2030-06-15', type: 'EXPENSE', category: 'GIFTS', ...extra }
  });

  it('follows the usual timing unless given its own, which can change', async () => {
    const { token, budgetId } = await createUserWithBudget();
    const created = await gql(TIMING, input(budgetId), token);
    expect(created.data.createOneOffPayment.oneOffPayment.dueReminder).toEqual({ off: false, days: null });

    const { id } = created.data.createOneOffPayment.oneOffPayment;
    const updated = await gql(UPDATE_TIMING, { id, input: { dueReminder: { off: false, days: 3 } } }, token);
    expect(updated.data.updateOneOffPayment.oneOffPayment.dueReminder).toEqual({ off: false, days: 3 });
  });

  it('rejects days that are not a choice', async () => {
    const { token, budgetId } = await createUserWithBudget();
    const body = await gql(TIMING, input(budgetId, { dueReminder: { off: false, days: 5 } }), token);
    expect(errorCode(body)).toBe('BAD_USER_INPUT');
  });
});

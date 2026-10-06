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

const FIELDS = 'id account name amount dueDate type category';
const CREATE = `mutation ($input: CreateOneOffPaymentInput!) {
  createOneOffPayment(input: $input) { success oneOffPayment { ${FIELDS} } }
}`;
const UNKNOWN = '507f1f77bcf86cd799439011';

const makePayment = (token: string | undefined, accountId: string, name: string, extra: Variables = {}) =>
  gql(
    CREATE,
    {
      input: {
        accountId,
        name,
        amount: 10,
        dueDate: '2030-06-15',
        type: 'EXPENSE',
        category: 'FOOD',
        ...extra
      }
    },
    token
  );

const idOf = (body: GqlBody) => body.data.createOneOffPayment.oneOffPayment.id;

describe('createOneOffPayment', () => {
  it('creates a payment and adds it to the account', async () => {
    const { token, accountId } = await createUserWithAccount();
    const body = await makePayment(token, accountId, 'Holiday', { amount: 250.75 });
    expect(body.errors).toBeUndefined();
    const { success, oneOffPayment } = body.data.createOneOffPayment;
    expect(success).toBe(true);
    expect(oneOffPayment).toMatchObject({
      account: accountId,
      name: 'Holiday',
      amount: 250.75,
      type: 'EXPENSE',
      category: 'FOOD'
    });
    // Date fields are exposed through GraphQL String, which serializes as epoch milliseconds
    expect(oneOffPayment.dueDate).toBe(String(new Date('2030-06-15').getTime()));
    const account = await mongoose.model('Account').findById(accountId).populate('oneOffPayments');
    expect(account.oneOffPayments.map((r: { id: string }) => r.id)).toEqual([oneOffPayment.id]);
  });

  it('rejects a duplicate name', async () => {
    const { token, accountId } = await createUserWithAccount();
    await makePayment(token, accountId, 'Dup');
    const body = await makePayment(token, accountId, 'Dup');
    expect(errorCode(body)).toBe('PAYMENT_EXISTS');
  });

  it('rejects an enum value outside the schema with a validation error', async () => {
    const { token, accountId } = await createUserWithAccount();
    const body = await makePayment(token, accountId, 'Bad', { type: 'NOPE' });
    expect(body.errors).toBeDefined();
    expect(body.data).toBeUndefined();
  });

  it('returns FORBIDDEN for another users account', async () => {
    const owner = await createUserWithAccount();
    const other = await createUserWithAccount();
    const body = await makePayment(other.token, owner.accountId, 'Sneaky');
    expect(errorCode(body)).toBe('FORBIDDEN');
  });

  it('requires authentication', async () => {
    const { accountId } = await createUserWithAccount();
    const body = await makePayment(undefined, accountId, 'x');
    expect(errorCode(body)).toBe('UNAUTHENTICATED');
  });
});

describe('reading one-off payments', () => {
  it("lists them on the user's account, sorted by amount", async () => {
    const { token, accountId } = await createUserWithAccount();
    await makePayment(token, accountId, 'Big', { amount: 900 });
    await makePayment(token, accountId, 'Small', { amount: 5 });
    const body = await gql(`query { account { oneOffPayments { name amount } } }`, undefined, token);
    expect(body.errors).toBeUndefined();
    expect(body.data.account.oneOffPayments.map((p: { name: string }) => p.name)).toEqual(['Small', 'Big']);
  });
});

describe('updateOneOffPayment', () => {
  const UPDATE = `mutation ($id: ID!, $input: UpdateOneOffPaymentInput!) {
    updateOneOffPayment(id: $id, input: $input) { success oneOffPayment { ${FIELDS} } }
  }`;

  it('updates provided fields only', async () => {
    const { token, accountId } = await createUserWithAccount();
    const created = await makePayment(token, accountId, 'Edit me', { amount: 10 });
    const body = await gql(
      UPDATE,
      { id: idOf(created), input: { amount: 99, category: 'GIFT' } },
      token
    );
    expect(body.errors).toBeUndefined();
    expect(body.data.updateOneOffPayment.oneOffPayment).toMatchObject({
      name: 'Edit me',
      amount: 99,
      category: 'GIFT',
      type: 'EXPENSE'
    });
  });

  it('returns PAYMENT_NOT_FOUND for an unknown id', async () => {
    const { token } = await createUserWithAccount();
    const body = await gql(UPDATE, { id: UNKNOWN, input: { amount: 1 } }, token);
    expect(errorCode(body)).toBe('PAYMENT_NOT_FOUND');
  });

  it('returns FORBIDDEN for another users payment', async () => {
    const owner = await createUserWithAccount();
    const other = await createUserWithAccount();
    const created = await makePayment(owner.token, owner.accountId, 'Private');
    const body = await gql(UPDATE, { id: idOf(created), input: { amount: 1 } }, other.token);
    expect(errorCode(body)).toBe('FORBIDDEN');
  });
});

describe('batchDeleteOneOffPayments', () => {
  const BATCH = `mutation ($ids: [ID!]!) {
    batchDeleteOneOffPayments(ids: $ids) { success deletedCount ids }
  }`;

  it('deletes payments, pulls them from the account and returns their ids', async () => {
    const { token, accountId } = await createUserWithAccount();
    const ids = [];
    for (const name of ['A', 'B', 'C']) {
      ids.push(idOf(await makePayment(token, accountId, name)));
    }
    const body = await gql(BATCH, { ids: ids.slice(0, 2) }, token);
    expect(body.errors).toBeUndefined();
    expect(body.data.batchDeleteOneOffPayments).toEqual({
      success: true,
      deletedCount: 2,
      ids: ids.slice(0, 2)
    });
    expect(await mongoose.model('OneOffPayment').countDocuments()).toBe(1);
    const account = await mongoose.model('Account').findById(accountId).populate('oneOffPayments');
    expect(account.oneOffPayments.map((r: { id: string }) => r.id)).toEqual([ids[2]]);
  });

  it('fails when any payment is missing', async () => {
    const { token, accountId } = await createUserWithAccount();
    const id = idOf(await makePayment(token, accountId, 'A'));
    const body = await gql(BATCH, { ids: [id, UNKNOWN] }, token);
    expect(errorCode(body)).toBe('PAYMENTS_NOT_FOUND');
    expect(await mongoose.model('OneOffPayment').countDocuments()).toBe(1);
  });

  it('returns FORBIDDEN for another users payments', async () => {
    const owner = await createUserWithAccount();
    const other = await createUserWithAccount();
    const id = idOf(await makePayment(owner.token, owner.accountId, 'A'));
    const body = await gql(BATCH, { ids: [id] }, other.token);
    expect(errorCode(body)).toBe('FORBIDDEN');
    expect(await mongoose.model('OneOffPayment').countDocuments()).toBe(1);
  });
});

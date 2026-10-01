import mongoose from 'mongoose';
import {
  setupTestApp,
  teardownTestApp,
  clearDatabase,
  gql,
  errorCode,
  createUserWithAccount
} from '../helpers';

beforeAll(setupTestApp);
afterAll(teardownTestApp);
beforeEach(clearDatabase);

const FIELDS = 'id account name amount dueDate type category';
const CREATE = `mutation ($p: OneOffPaymentInput!) {
  createOneOffPayment(oneOffPayment: $p) { success oneOffPayment { ${FIELDS} } }
}`;
const UNKNOWN = '507f1f77bcf86cd799439011';

const makePayment = (token, accountId, name, extra = {}) =>
  gql(
    CREATE,
    {
      p: {
        account: accountId,
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

const idOf = body => body.data.createOneOffPayment.oneOffPayment.id;

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
    const account = await mongoose.model('Account').findById(accountId);
    expect(account.oneOffPayments.map(String)).toEqual([oneOffPayment.id]);
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

describe('one-off payment queries', () => {
  it('lists payments sorted by amount', async () => {
    const { token, accountId } = await createUserWithAccount();
    await makePayment(token, accountId, 'Big', { amount: 900 });
    await makePayment(token, accountId, 'Small', { amount: 5 });
    const body = await gql(
      `query ($id: ID!) { oneOffPayments(accountId: $id) { name amount } }`,
      { id: accountId },
      token
    );
    expect(body.errors).toBeUndefined();
    expect(body.data.oneOffPayments.map(p => p.name)).toEqual(['Small', 'Big']);
  });

  it('returns PAYMENTS_NOT_FOUND when there are none', async () => {
    const { token, accountId } = await createUserWithAccount();
    const body = await gql(
      `query ($id: ID!) { oneOffPayments(accountId: $id) { name } }`,
      { id: accountId },
      token
    );
    expect(errorCode(body)).toBe('PAYMENTS_NOT_FOUND');
  });

  it('finds a payment by id', async () => {
    const { token, accountId } = await createUserWithAccount();
    const created = await makePayment(token, accountId, 'One');
    const body = await gql(
      `query ($id: ID) { oneOffPayment(id: $id) { ${FIELDS} } }`,
      { id: idOf(created) },
      token
    );
    expect(body.data.oneOffPayment.name).toBe('One');
  });

  it('returns PAYMENT_NOT_FOUND for an unknown id', async () => {
    const { token } = await createUserWithAccount();
    const body = await gql(
      `query ($id: ID) { oneOffPayment(id: $id) { id } }`,
      { id: UNKNOWN },
      token
    );
    expect(errorCode(body)).toBe('PAYMENT_NOT_FOUND');
  });

  it('returns FORBIDDEN for another users payment', async () => {
    const owner = await createUserWithAccount();
    const other = await createUserWithAccount();
    const created = await makePayment(owner.token, owner.accountId, 'Private');
    const body = await gql(
      `query ($id: ID) { oneOffPayment(id: $id) { id } }`,
      { id: idOf(created) },
      other.token
    );
    expect(errorCode(body)).toBe('FORBIDDEN');
  });
});

describe('editOneOffPayment', () => {
  const EDIT = `mutation ($id: ID!, $p: OneOffPaymentInput!) {
    editOneOffPayment(id: $id, oneOffPayment: $p) { success oneOffPayment { ${FIELDS} } }
  }`;

  it('updates provided fields only', async () => {
    const { token, accountId } = await createUserWithAccount();
    const created = await makePayment(token, accountId, 'Edit me', { amount: 10 });
    const body = await gql(
      EDIT,
      { id: idOf(created), p: { amount: 99, category: 'GIFT' } },
      token
    );
    expect(body.errors).toBeUndefined();
    expect(body.data.editOneOffPayment.oneOffPayment).toMatchObject({
      name: 'Edit me',
      amount: 99,
      category: 'GIFT',
      type: 'EXPENSE'
    });
  });

  it('returns PAYMENT_NOT_FOUND for an unknown id', async () => {
    const { token } = await createUserWithAccount();
    const body = await gql(EDIT, { id: UNKNOWN, p: { amount: 1 } }, token);
    expect(errorCode(body)).toBe('PAYMENT_NOT_FOUND');
  });

  it('returns FORBIDDEN for another users payment', async () => {
    const owner = await createUserWithAccount();
    const other = await createUserWithAccount();
    const created = await makePayment(owner.token, owner.accountId, 'Private');
    const body = await gql(EDIT, { id: idOf(created), p: { amount: 1 } }, other.token);
    expect(errorCode(body)).toBe('FORBIDDEN');
  });
});

describe('deleteOneOffPayment', () => {
  const DELETE = `mutation ($id: ID!) {
    deleteOneOffPayment(id: $id) { success oneOffPayment { id name } }
  }`;

  it('deletes the payment and removes it from the account', async () => {
    const { token, accountId } = await createUserWithAccount();
    const created = await makePayment(token, accountId, 'Gone');
    const id = idOf(created);
    const body = await gql(DELETE, { id }, token);
    expect(body.errors).toBeUndefined();
    expect(body.data.deleteOneOffPayment).toMatchObject({
      success: true,
      oneOffPayment: { id, name: 'Gone' }
    });
    expect(await mongoose.model('OneOffPayment').countDocuments()).toBe(0);
    const account = await mongoose.model('Account').findById(accountId);
    expect(account.oneOffPayments).toHaveLength(0);
  });

  it('returns PAYMENT_NOT_FOUND for an unknown id', async () => {
    const { token } = await createUserWithAccount();
    const body = await gql(DELETE, { id: UNKNOWN }, token);
    expect(errorCode(body)).toBe('PAYMENT_NOT_FOUND');
  });

  it('returns FORBIDDEN for another users payment', async () => {
    const owner = await createUserWithAccount();
    const other = await createUserWithAccount();
    const created = await makePayment(owner.token, owner.accountId, 'Private');
    const body = await gql(DELETE, { id: idOf(created) }, other.token);
    expect(errorCode(body)).toBe('FORBIDDEN');
  });
});

describe('batchDeleteOneOffPayments', () => {
  const BATCH = `mutation ($ids: [ID!]!) {
    batchDeleteOneOffPayments(ids: $ids) { success deletedCount oneOffPayments { name } }
  }`;

  it('deletes payments and pulls them from the account', async () => {
    const { token, accountId } = await createUserWithAccount();
    const ids = [];
    for (const name of ['A', 'B', 'C']) {
      ids.push(idOf(await makePayment(token, accountId, name)));
    }
    const body = await gql(BATCH, { ids: ids.slice(0, 2) }, token);
    expect(body.errors).toBeUndefined();
    expect(body.data.batchDeleteOneOffPayments.success).toBe(true);
    expect(body.data.batchDeleteOneOffPayments.deletedCount).toBe(2);
    expect(body.data.batchDeleteOneOffPayments.oneOffPayments.map(p => p.name).sort()).toEqual([
      'A',
      'B'
    ]);
    expect(await mongoose.model('OneOffPayment').countDocuments()).toBe(1);
    const account = await mongoose.model('Account').findById(accountId);
    expect(account.oneOffPayments.map(String)).toEqual([ids[2]]);
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
  });
});

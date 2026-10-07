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

const FIELDS = 'id name amount category frequency type firstPaymentDate lastPaymentDate account';
const CREATE = `mutation ($input: CreateRecurringPaymentInput!) {
  createRecurringPayment(input: $input) { success recurringPayment { ${FIELDS} } }
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
        category: 'SUBSCRIPTION',
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
  it('creates a payment and adds it to the account', async () => {
    const { token, accountId } = await createUserWithAccount();
    const body = await makePayment(token, accountId, 'Netflix', { amount: 9.99 });
    expect(body.errors).toBeUndefined();
    const { success, recurringPayment } = body.data.createRecurringPayment;
    expect(success).toBe(true);
    expect(recurringPayment).toMatchObject({
      name: 'Netflix',
      amount: 9.99,
      category: 'SUBSCRIPTION',
      frequency: 'MONTHLY',
      type: 'EXPENSE',
      account: accountId,
      lastPaymentDate: null
    });
    // Date fields are exposed through GraphQL String, which serializes as epoch milliseconds
    expect(recurringPayment.firstPaymentDate).toBe(String(new Date('2030-01-01').getTime()));
    const account = await mongoose.model('Account').findById(accountId).populate('recurringPayments');
    expect(account.recurringPayments.map((r: { id: string }) => r.id)).toEqual([recurringPayment.id]);
  });

  it('rejects a duplicate name', async () => {
    const { token, accountId } = await createUserWithAccount();
    await makePayment(token, accountId, 'Dup');
    const body = await makePayment(token, accountId, 'Dup');
    expect(errorCode(body)).toBe('PAYMENT_EXISTS');
  });

  it('rejects a name used by a one-off payment', async () => {
    const { token, accountId } = await createUserWithAccount();
    await gql(
      `mutation ($input: CreateOneOffPaymentInput!) { createOneOffPayment(input: $input) { success } }`,
      {
        input: { accountId, name: 'Shared', amount: 1, dueDate: '2030-06-15', type: 'EXPENSE', category: 'FOOD' }
      },
      token
    );
    const body = await makePayment(token, accountId, 'Shared');
    expect(errorCode(body)).toBe('PAYMENT_EXISTS');
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

describe('reading recurring payments', () => {
  it("lists them on the user's account, sorted by amount", async () => {
    const { token, accountId } = await createUserWithAccount();
    await makePayment(token, accountId, 'Big', { amount: 900 });
    await makePayment(token, accountId, 'Small', { amount: 5 });
    const body = await gql(`query { account { recurringPayments { name amount } } }`, undefined, token);
    expect(body.errors).toBeUndefined();
    expect(body.data.account.recurringPayments.map((p: { name: string }) => p.name)).toEqual(['Small', 'Big']);
  });
});

describe('updateRecurringPayment', () => {
  const UPDATE = `mutation ($id: ID!, $input: UpdateRecurringPaymentInput!) {
    updateRecurringPayment(id: $id, input: $input) { success recurringPayment { ${FIELDS} } }
  }`;

  it('updates provided fields only', async () => {
    const { token, accountId } = await createUserWithAccount();
    const created = await makePayment(token, accountId, 'Edit me');
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
      account: accountId
    });
  });

  it('rejects an empty update', async () => {
    const { token, accountId } = await createUserWithAccount();
    const created = await makePayment(token, accountId, 'Edit me');
    const body = await gql(UPDATE, { id: idOf(created), input: {} }, token);
    expect(errorCode(body)).toBe('RECURRING_PAYMENT_UPDATE_FAILED');
  });

  it('rejects paid or skipped dates with a validation error, as only paying or skipping records them', async () => {
    const { token, accountId } = await createUserWithAccount();
    const created = await makePayment(token, accountId, 'Edit me');
    const handled = [{ outcome: 'PAID', dates: ['2030-01-01'] }];
    const body = await gql(UPDATE, { id: idOf(created), input: { handled } }, token);
    expect(body.errors).toBeDefined();
    expect(body.data).toBeUndefined();
    const stored = await mongoose.model('RecurringPayment').findById(idOf(created));
    expect(stored.toObject().handled).toEqual([]);
  });

  it('rejects renaming to an existing recurring payment name', async () => {
    const { token, accountId } = await createUserWithAccount();
    await makePayment(token, accountId, 'First');
    const second = await makePayment(token, accountId, 'Second');
    const body = await gql(UPDATE, { id: idOf(second), input: { name: 'First' } }, token);
    expect(errorCode(body)).toBe('RECURRING_PAYMENT_EXISTS');
  });

  it('returns RECURRING_PAYMENT_NOT_FOUND for an unknown id', async () => {
    const { token } = await createUserWithAccount();
    const body = await gql(UPDATE, { id: UNKNOWN, input: { amount: 1 } }, token);
    expect(errorCode(body)).toBe('RECURRING_PAYMENT_NOT_FOUND');
  });

  it('returns FORBIDDEN for another users payment', async () => {
    const owner = await createUserWithAccount();
    const other = await createUserWithAccount();
    const created = await makePayment(owner.token, owner.accountId, 'Private');
    const body = await gql(UPDATE, { id: idOf(created), input: { amount: 1 } }, other.token);
    expect(errorCode(body)).toBe('FORBIDDEN');
  });
});

describe('batchDeleteRecurringPayments', () => {
  const BATCH = `mutation ($ids: [ID!]!) { batchDeleteRecurringPayments(ids: $ids) { success deletedCount ids } }`;

  const createThree = async () => {
    const user = await createUserWithAccount();
    const ids = [];
    for (const name of ['A', 'B', 'C']) {
      ids.push(idOf(await makePayment(user.token, user.accountId, name)));
    }
    return { ...user, ids };
  };

  it('deletes payments, pulls them from the account and returns their ids', async () => {
    const { token, accountId, ids } = await createThree();
    const body = await gql(BATCH, { ids: ids.slice(0, 2) }, token);
    expect(body.errors).toBeUndefined();
    expect(body.data.batchDeleteRecurringPayments).toEqual({
      success: true,
      deletedCount: 2,
      ids: ids.slice(0, 2)
    });
    expect(await mongoose.model('RecurringPayment').countDocuments()).toBe(1);
    const account = await mongoose.model('Account').findById(accountId).populate('recurringPayments');
    expect(account.recurringPayments.map((r: { id: string }) => r.id)).toEqual([ids[2]]);
  });

  it('fails when any payment is missing', async () => {
    const { token, ids } = await createThree();
    const body = await gql(BATCH, { ids: [ids[0], UNKNOWN] }, token);
    expect(errorCode(body)).toBe('RECURRING_PAYMENTS_NOT_FOUND');
    expect(await mongoose.model('RecurringPayment').countDocuments()).toBe(3);
  });

  it('returns FORBIDDEN for another users payments', async () => {
    const { ids } = await createThree();
    const other = await createUserWithAccount();
    const body = await gql(BATCH, { ids }, other.token);
    expect(errorCode(body)).toBe('FORBIDDEN');
    expect(await mongoose.model('RecurringPayment').countDocuments()).toBe(3);
  });
});

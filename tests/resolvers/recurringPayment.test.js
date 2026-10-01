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

const FIELDS =
  'id name amount category frequency type firstPaymentDate lastPaymentDate account { id }';
const CREATE = `mutation ($input: CreateRecurringPaymentInput!) {
  createRecurringPayment(input: $input) { success recurringPayment { ${FIELDS} } }
}`;
const UNKNOWN = '507f1f77bcf86cd799439011';

const makePayment = (token, accountId, name, extra = {}) =>
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

const idOf = body => body.data.createRecurringPayment.recurringPayment.id;

describe('createRecurringPayment', () => {
  it('creates a payment, returns the populated account and adds it to the account', async () => {
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
      account: { id: accountId },
      lastPaymentDate: null
    });
    // Date fields are exposed through GraphQL String, which serializes as epoch milliseconds
    expect(recurringPayment.firstPaymentDate).toBe(String(new Date('2030-01-01').getTime()));
    const account = await mongoose.model('Account').findById(accountId);
    expect(account.recurringPayments.map(String)).toEqual([recurringPayment.id]);
  });

  it('rejects a duplicate name', async () => {
    const { token, accountId } = await createUserWithAccount();
    await makePayment(token, accountId, 'Dup');
    const body = await makePayment(token, accountId, 'Dup');
    expect(errorCode(body)).toBe('PAYMENT_EXISTS');
  });

  it('rejects a name used by a bill', async () => {
    const { token, accountId } = await createUserWithAccount();
    await gql(
      `mutation ($bill: BillInput!) { createBill(bill: $bill) { success } }`,
      { bill: { account: accountId, name: 'Shared', amount: 1, paid: false } },
      token
    );
    const body = await makePayment(token, accountId, 'Shared');
    expect(errorCode(body)).toBe('BILL_EXISTS');
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

describe('recurring payment queries', () => {
  it('lists payments sorted by amount', async () => {
    const { token, accountId } = await createUserWithAccount();
    await makePayment(token, accountId, 'Big', { amount: 900 });
    await makePayment(token, accountId, 'Small', { amount: 5 });
    const body = await gql(
      `query ($id: ID!) { recurringPayments(accountId: $id) { name amount } }`,
      { id: accountId },
      token
    );
    expect(body.errors).toBeUndefined();
    expect(body.data.recurringPayments.map(p => p.name)).toEqual(['Small', 'Big']);
  });

  it('returns RECURRING_PAYMENTS_NOT_FOUND when there are none', async () => {
    const { token, accountId } = await createUserWithAccount();
    const body = await gql(
      `query ($id: ID!) { recurringPayments(accountId: $id) { name } }`,
      { id: accountId },
      token
    );
    expect(errorCode(body)).toBe('RECURRING_PAYMENTS_NOT_FOUND');
  });

  it('finds a payment by id with its account', async () => {
    const { token, accountId } = await createUserWithAccount();
    const created = await makePayment(token, accountId, 'One');
    const body = await gql(
      `query ($id: ID!) { recurringPayment(id: $id) { name account { id } } }`,
      { id: idOf(created) },
      token
    );
    expect(body.errors).toBeUndefined();
    expect(body.data.recurringPayment).toEqual({ name: 'One', account: { id: accountId } });
  });

  it('returns RECURRING_PAYMENT_NOT_FOUND for an unknown id', async () => {
    const { token } = await createUserWithAccount();
    const body = await gql(
      `query ($id: ID!) { recurringPayment(id: $id) { id } }`,
      { id: UNKNOWN },
      token
    );
    expect(errorCode(body)).toBe('RECURRING_PAYMENT_NOT_FOUND');
  });

  it('returns FORBIDDEN for another users payment', async () => {
    const owner = await createUserWithAccount();
    const other = await createUserWithAccount();
    const created = await makePayment(owner.token, owner.accountId, 'Private');
    const body = await gql(
      `query ($id: ID!) { recurringPayment(id: $id) { id } }`,
      { id: idOf(created) },
      other.token
    );
    expect(errorCode(body)).toBe('FORBIDDEN');
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
      account: { id: accountId }
    });
  });

  it('rejects an empty update', async () => {
    const { token, accountId } = await createUserWithAccount();
    const created = await makePayment(token, accountId, 'Edit me');
    const body = await gql(UPDATE, { id: idOf(created), input: {} }, token);
    expect(errorCode(body)).toBe('RECURRING_PAYMENT_UPDATE_FAILED');
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

describe('deleteRecurringPayment', () => {
  const DELETE = `mutation ($id: ID!) { deleteRecurringPayment(id: $id) { success } }`;

  it('deletes the payment and removes it from the account', async () => {
    const { token, accountId } = await createUserWithAccount();
    const created = await makePayment(token, accountId, 'Gone');
    const body = await gql(DELETE, { id: idOf(created) }, token);
    expect(body.errors).toBeUndefined();
    expect(body.data.deleteRecurringPayment.success).toBe(true);
    expect(await mongoose.model('RecurringPayment').countDocuments()).toBe(0);
    const account = await mongoose.model('Account').findById(accountId);
    expect(account.recurringPayments).toHaveLength(0);
  });

  it('returns RECURRING_PAYMENT_NOT_FOUND for an unknown id', async () => {
    const { token } = await createUserWithAccount();
    const body = await gql(DELETE, { id: UNKNOWN }, token);
    expect(errorCode(body)).toBe('RECURRING_PAYMENT_NOT_FOUND');
  });

  it('returns FORBIDDEN for another users payment', async () => {
    const owner = await createUserWithAccount();
    const other = await createUserWithAccount();
    const created = await makePayment(owner.token, owner.accountId, 'Private');
    const body = await gql(DELETE, { id: idOf(created) }, other.token);
    expect(errorCode(body)).toBe('FORBIDDEN');
  });
});

describe('batch recurring payment operations', () => {
  const createThree = async () => {
    const user = await createUserWithAccount();
    const ids = [];
    for (const name of ['A', 'B', 'C']) {
      ids.push(idOf(await makePayment(user.token, user.accountId, name)));
    }
    return { ...user, ids };
  };

  it('batchUpdateRecurringPayments updates several payments', async () => {
    const { token, ids } = await createThree();
    const body = await gql(
      `mutation ($input: [BatchUpdateRecurringPaymentInput!]!) {
        batchUpdateRecurringPayments(input: $input) {
          success recurringPayments { name amount account { id } }
        }
      }`,
      {
        input: [
          { id: ids[0], amount: 111 },
          { id: ids[1], amount: 222, frequency: 'WEEKLY' }
        ]
      },
      token
    );
    expect(body.errors).toBeUndefined();
    expect(body.data.batchUpdateRecurringPayments.success).toBe(true);
    const byName = Object.fromEntries(
      body.data.batchUpdateRecurringPayments.recurringPayments.map(p => [p.name, p.amount])
    );
    expect(byName).toEqual({ A: 111, B: 222 });
  });

  it('batchUpdateRecurringPayments fails for an unknown payment', async () => {
    const { token } = await createThree();
    const body = await gql(
      `mutation ($input: [BatchUpdateRecurringPaymentInput!]!) {
        batchUpdateRecurringPayments(input: $input) { success }
      }`,
      { input: [{ id: UNKNOWN, amount: 1 }] },
      token
    );
    expect(errorCode(body)).toBe('RECURRING_PAYMENT_NOT_FOUND');
  });

  it('batchDeleteRecurringPayments deletes payments and pulls them from the account', async () => {
    const { token, accountId, ids } = await createThree();
    const body = await gql(
      `mutation ($ids: [ID!]!) { batchDeleteRecurringPayments(ids: $ids) { success deletedCount } }`,
      { ids: ids.slice(0, 2) },
      token
    );
    expect(body.errors).toBeUndefined();
    expect(body.data.batchDeleteRecurringPayments).toEqual({ success: true, deletedCount: 2 });
    expect(await mongoose.model('RecurringPayment').countDocuments()).toBe(1);
    const account = await mongoose.model('Account').findById(accountId);
    expect(account.recurringPayments.map(String)).toEqual([ids[2]]);
  });

  it('batchDeleteRecurringPayments fails when any payment is missing', async () => {
    const { token, ids } = await createThree();
    const body = await gql(
      `mutation ($ids: [ID!]!) { batchDeleteRecurringPayments(ids: $ids) { success } }`,
      { ids: [ids[0], UNKNOWN] },
      token
    );
    expect(errorCode(body)).toBe('RECURRING_PAYMENTS_NOT_FOUND');
    expect(await mongoose.model('RecurringPayment').countDocuments()).toBe(3);
  });

  it('batchDeleteRecurringPayments returns FORBIDDEN for another users payments', async () => {
    const { ids } = await createThree();
    const other = await createUserWithAccount();
    const body = await gql(
      `mutation ($ids: [ID!]!) { batchDeleteRecurringPayments(ids: $ids) { success } }`,
      { ids },
      other.token
    );
    expect(errorCode(body)).toBe('FORBIDDEN');
  });
});

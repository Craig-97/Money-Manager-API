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

const FIELDS = 'id account name amount paid';
const CREATE = `mutation ($bill: BillInput!) { createBill(bill: $bill) { success bill { ${FIELDS} } } }`;
const UNKNOWN = '507f1f77bcf86cd799439011';

const makeBill = (token, accountId, name, amount = 10, paid = false) =>
  gql(CREATE, { bill: { account: accountId, name, amount, paid } }, token);

describe('createBill', () => {
  it('creates a bill and adds it to the account', async () => {
    const { token, accountId } = await createUserWithAccount();
    const body = await makeBill(token, accountId, 'Rent', 500);
    expect(body.errors).toBeUndefined();
    expect(body.data.createBill.success).toBe(true);
    expect(body.data.createBill.bill).toMatchObject({
      account: accountId,
      name: 'Rent',
      amount: 500,
      paid: false
    });
    const account = await mongoose.model('Account').findById(accountId);
    expect(account.bills.map(String)).toEqual([body.data.createBill.bill.id]);
  });

  it('rejects a duplicate name', async () => {
    const { token, accountId } = await createUserWithAccount();
    await makeBill(token, accountId, 'Rent');
    const body = await makeBill(token, accountId, 'Rent');
    expect(errorCode(body)).toBe('BILL_EXISTS');
  });

  it('rejects a name already used by a one-off payment', async () => {
    const { token, accountId } = await createUserWithAccount();
    await gql(
      `mutation ($p: OneOffPaymentInput!) { createOneOffPayment(oneOffPayment: $p) { success } }`,
      {
        p: {
          account: accountId,
          name: 'Shared',
          amount: 1,
          dueDate: '2030-01-01',
          type: 'EXPENSE',
          category: 'FOOD'
        }
      },
      token
    );
    const body = await makeBill(token, accountId, 'Shared');
    expect(errorCode(body)).toBe('PAYMENT_EXISTS');
  });

  it('returns FORBIDDEN for another users account', async () => {
    const owner = await createUserWithAccount();
    const other = await createUserWithAccount();
    const body = await makeBill(other.token, owner.accountId, 'Sneaky');
    expect(errorCode(body)).toBe('FORBIDDEN');
  });

  it('requires authentication', async () => {
    const { accountId } = await createUserWithAccount();
    const body = await makeBill(undefined, accountId, 'Rent');
    expect(errorCode(body)).toBe('UNAUTHENTICATED');
  });
});

describe('bill queries', () => {
  it('lists bills for an account sorted by amount', async () => {
    const { token, accountId } = await createUserWithAccount();
    await makeBill(token, accountId, 'Big', 900);
    await makeBill(token, accountId, 'Small', 5);
    const body = await gql(
      `query ($id: ID!) { bills(accountId: $id) { name amount } }`,
      { id: accountId },
      token
    );
    expect(body.errors).toBeUndefined();
    expect(body.data.bills.map(b => b.name)).toEqual(['Small', 'Big']);
  });

  it('returns BILLS_NOT_FOUND when the account has no bills', async () => {
    const { token, accountId } = await createUserWithAccount();
    const body = await gql(
      `query ($id: ID!) { bills(accountId: $id) { name } }`,
      { id: accountId },
      token
    );
    expect(errorCode(body)).toBe('BILLS_NOT_FOUND');
  });

  it('returns FORBIDDEN when listing another users bills', async () => {
    const owner = await createUserWithAccount();
    const other = await createUserWithAccount();
    await makeBill(owner.token, owner.accountId, 'Rent');
    const body = await gql(
      `query ($id: ID!) { bills(accountId: $id) { name } }`,
      { id: owner.accountId },
      other.token
    );
    expect(errorCode(body)).toBe('FORBIDDEN');
  });

  it('finds a single bill', async () => {
    const { token, accountId } = await createUserWithAccount();
    const created = await makeBill(token, accountId, 'Rent', 700);
    const body = await gql(
      `query ($id: ID) { bill(id: $id) { ${FIELDS} } }`,
      { id: created.data.createBill.bill.id },
      token
    );
    expect(body.data.bill).toMatchObject({ name: 'Rent', amount: 700 });
  });

  it('returns BILL_NOT_FOUND for an unknown bill', async () => {
    const { token } = await createUserWithAccount();
    const body = await gql(`query ($id: ID) { bill(id: $id) { id } }`, { id: UNKNOWN }, token);
    expect(errorCode(body)).toBe('BILL_NOT_FOUND');
  });

  it('returns FORBIDDEN when fetching another users bill', async () => {
    const owner = await createUserWithAccount();
    const other = await createUserWithAccount();
    const created = await makeBill(owner.token, owner.accountId, 'Rent');
    const body = await gql(
      `query ($id: ID) { bill(id: $id) { id } }`,
      { id: created.data.createBill.bill.id },
      other.token
    );
    expect(errorCode(body)).toBe('FORBIDDEN');
  });
});

describe('editBill', () => {
  const EDIT = `mutation ($id: ID!, $bill: BillInput!) {
    editBill(id: $id, bill: $bill) { success bill { ${FIELDS} } }
  }`;

  it('updates provided fields only', async () => {
    const { token, accountId } = await createUserWithAccount();
    const created = await makeBill(token, accountId, 'Rent', 700);
    const body = await gql(
      EDIT,
      { id: created.data.createBill.bill.id, bill: { paid: true, amount: 650 } },
      token
    );
    expect(body.errors).toBeUndefined();
    expect(body.data.editBill.bill).toMatchObject({ name: 'Rent', amount: 650, paid: true });
  });

  it('returns BILL_NOT_FOUND for an unknown bill', async () => {
    const { token } = await createUserWithAccount();
    const body = await gql(EDIT, { id: UNKNOWN, bill: { paid: true } }, token);
    expect(errorCode(body)).toBe('BILL_NOT_FOUND');
  });

  it('returns FORBIDDEN for another users bill', async () => {
    const owner = await createUserWithAccount();
    const other = await createUserWithAccount();
    const created = await makeBill(owner.token, owner.accountId, 'Rent');
    const body = await gql(
      EDIT,
      { id: created.data.createBill.bill.id, bill: { paid: true } },
      other.token
    );
    expect(errorCode(body)).toBe('FORBIDDEN');
  });
});

describe('deleteBill', () => {
  const DELETE = `mutation ($id: ID!) { deleteBill(id: $id) { success bill { id name } } }`;

  it('deletes the bill and removes it from the account', async () => {
    const { token, accountId } = await createUserWithAccount();
    const created = await makeBill(token, accountId, 'Rent');
    const id = created.data.createBill.bill.id;
    const body = await gql(DELETE, { id }, token);
    expect(body.errors).toBeUndefined();
    expect(body.data.deleteBill).toMatchObject({ success: true, bill: { id, name: 'Rent' } });
    expect(await mongoose.model('Bill').countDocuments()).toBe(0);
    const account = await mongoose.model('Account').findById(accountId);
    expect(account.bills).toHaveLength(0);
  });

  it('returns BILL_NOT_FOUND for an unknown bill', async () => {
    const { token } = await createUserWithAccount();
    const body = await gql(DELETE, { id: UNKNOWN }, token);
    expect(errorCode(body)).toBe('BILL_NOT_FOUND');
  });

  it('returns FORBIDDEN for another users bill', async () => {
    const owner = await createUserWithAccount();
    const other = await createUserWithAccount();
    const created = await makeBill(owner.token, owner.accountId, 'Rent');
    const body = await gql(DELETE, { id: created.data.createBill.bill.id }, other.token);
    expect(errorCode(body)).toBe('FORBIDDEN');
  });
});

describe('batch bill operations', () => {
  const createThree = async () => {
    const user = await createUserWithAccount();
    const ids = [];
    for (const name of ['A', 'B', 'C']) {
      const created = await makeBill(user.token, user.accountId, name);
      ids.push(created.data.createBill.bill.id);
    }
    return { ...user, ids };
  };

  it('batchUpdateBills marks bills as paid', async () => {
    const { token, ids } = await createThree();
    const body = await gql(
      `mutation ($input: BatchBillUpdateInput!) {
        batchUpdateBills(input: $input) { success updatedCount bills { name paid } }
      }`,
      { input: { ids: ids.slice(0, 2), paid: true } },
      token
    );
    expect(body.errors).toBeUndefined();
    expect(body.data.batchUpdateBills.success).toBe(true);
    expect(body.data.batchUpdateBills.updatedCount).toBe(2);
    expect(body.data.batchUpdateBills.bills.every(b => b.paid)).toBe(true);
    expect(await mongoose.model('Bill').countDocuments({ paid: true })).toBe(2);
  });

  it('batchUpdateBills fails when any bill is missing', async () => {
    const { token, ids } = await createThree();
    const body = await gql(
      `mutation ($input: BatchBillUpdateInput!) { batchUpdateBills(input: $input) { success } }`,
      { input: { ids: [ids[0], UNKNOWN], paid: true } },
      token
    );
    expect(errorCode(body)).toBe('BILLS_NOT_FOUND');
  });

  it('batchUpdateBills returns FORBIDDEN for another users bills', async () => {
    const { ids } = await createThree();
    const other = await createUserWithAccount();
    const body = await gql(
      `mutation ($input: BatchBillUpdateInput!) { batchUpdateBills(input: $input) { success } }`,
      { input: { ids, paid: true } },
      other.token
    );
    expect(errorCode(body)).toBe('FORBIDDEN');
  });

  it('batchDeleteBills deletes bills and pulls them from the account', async () => {
    const { token, accountId, ids } = await createThree();
    const body = await gql(
      `mutation ($ids: [ID!]!) { batchDeleteBills(ids: $ids) { success deletedCount } }`,
      { ids: ids.slice(0, 2) },
      token
    );
    expect(body.errors).toBeUndefined();
    expect(body.data.batchDeleteBills).toEqual({ success: true, deletedCount: 2 });
    expect(await mongoose.model('Bill').countDocuments()).toBe(1);
    const account = await mongoose.model('Account').findById(accountId);
    expect(account.bills.map(String)).toEqual([ids[2]]);
  });

  it('batchDeleteBills fails when any bill is missing', async () => {
    const { token, ids } = await createThree();
    const body = await gql(
      `mutation ($ids: [ID!]!) { batchDeleteBills(ids: $ids) { success } }`,
      { ids: [ids[0], UNKNOWN] },
      token
    );
    expect(errorCode(body)).toBe('BILLS_NOT_FOUND');
    expect(await mongoose.model('Bill').countDocuments()).toBe(3);
  });
});

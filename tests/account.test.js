import mongoose from 'mongoose';
import {
  setupTestApp,
  teardownTestApp,
  clearDatabase,
  gql,
  errorCode,
  createUserWithAccount
} from './helpers';

beforeAll(setupTestApp);
afterAll(teardownTestApp);
beforeEach(clearDatabase);

const CREATE = `mutation ($account: CreateAccountInput!) {
  createAccount(account: $account) {
    success
    account {
      id bankBalance monthlyIncome
      user { id }
      bills { name amount paid }
      oneOffPayments { name amount type category }
      payday { frequency type }
    }
  }
}`;

const FIND = `query ($id: ID) {
  account(id: $id) {
    id bankBalance monthlyIncome
    user { id email }
    bills { name amount }
    oneOffPayments { name amount }
    notes { body }
    payday { frequency }
  }
}`;

describe('createAccount', () => {
  it('creates an account with nested bills, one-off payments and payday', async () => {
    const { token, user } = await createUserWithAccount({ withAccount: false });
    const body = await gql(
      CREATE,
      {
        account: {
          userId: user.id,
          bankBalance: 1500.5,
          monthlyIncome: 3000,
          bills: [{ name: 'Rent', amount: 800, paid: false }],
          oneOffPayments: [
            {
              name: 'Holiday',
              amount: 400,
              dueDate: '2030-01-01',
              type: 'EXPENSE',
              category: 'TRAVEL'
            }
          ],
          payday: { frequency: 'MONTHLY', type: 'LAST_DAY' }
        }
      },
      token
    );
    expect(body.errors).toBeUndefined();
    const { success, account } = body.data.createAccount;
    expect(success).toBe(true);
    expect(account).toMatchObject({
      bankBalance: 1500.5,
      monthlyIncome: 3000,
      user: { id: user.id },
      bills: [{ name: 'Rent', amount: 800, paid: false }],
      oneOffPayments: [{ name: 'Holiday', amount: 400, type: 'EXPENSE', category: 'TRAVEL' }],
      payday: { frequency: 'MONTHLY', type: 'LAST_DAY' }
    });
  });

  it('creates an account with several bills and payments in one transaction', async () => {
    const { token, user } = await createUserWithAccount({ withAccount: false });
    const payment = name => ({
      name,
      amount: 1,
      dueDate: '2030-01-01',
      type: 'EXPENSE',
      category: 'FOOD'
    });
    const body = await gql(
      CREATE,
      {
        account: {
          userId: user.id,
          bankBalance: 1,
          monthlyIncome: 1,
          bills: ['B1', 'B2', 'B3'].map(name => ({ name, amount: 1, paid: false })),
          oneOffPayments: [payment('P1'), payment('P2'), payment('P3')]
        }
      },
      token
    );
    expect(body.errors).toBeUndefined();
    const { account } = body.data.createAccount;
    expect(account.bills.map(b => b.name).sort()).toEqual(['B1', 'B2', 'B3']);
    expect(account.oneOffPayments.map(p => p.name).sort()).toEqual(['P1', 'P2', 'P3']);
  });

  it('links the account to the user', async () => {
    const { token, user, accountId } = await createUserWithAccount();
    const body = await gql(`query { tokenFindUser { account } }`, undefined, token);
    expect(body.data.tokenFindUser.account).toBe(accountId);
    expect(user.id).toBeDefined();
  });

  it('rejects a second account for the same user', async () => {
    const { token, user } = await createUserWithAccount();
    const body = await gql(
      CREATE,
      { account: { userId: user.id, bankBalance: 1, monthlyIncome: 1 } },
      token
    );
    expect(errorCode(body)).toBe('ACCOUNT_EXISTS');
  });

  it('returns USER_NOT_FOUND for an unknown user', async () => {
    const { token } = await createUserWithAccount({ withAccount: false });
    const body = await gql(
      CREATE,
      { account: { userId: '507f1f77bcf86cd799439011', bankBalance: 1, monthlyIncome: 1 } },
      token
    );
    expect(errorCode(body)).toBe('USER_NOT_FOUND');
  });

  it('requires authentication', async () => {
    const body = await gql(CREATE, {
      account: { userId: '507f1f77bcf86cd799439011', bankBalance: 1, monthlyIncome: 1 }
    });
    expect(errorCode(body)).toBe('UNAUTHENTICATED');
  });
});

describe('account queries', () => {
  it('finds an account by user id with populated, amount-sorted children', async () => {
    const { token, user, accountId } = await createUserWithAccount({
      account: {
        bills: [
          { name: 'Big', amount: 900, paid: false },
          { name: 'Small', amount: 10, paid: true }
        ]
      }
    });
    await gql(
      `mutation ($note: NoteInput!) { createNote(note: $note) { success } }`,
      { note: { account: accountId, body: 'Remember' } },
      token
    );
    const body = await gql(FIND, { id: user.id }, token);
    expect(body.errors).toBeUndefined();
    const account = body.data.account;
    expect(account.id).toBe(accountId);
    expect(account.user).toMatchObject({ id: user.id, email: user.email });
    expect(account.bills.map(b => b.name)).toEqual(['Small', 'Big']);
    expect(account.notes).toEqual([{ body: 'Remember' }]);
    expect(account.payday).toBeNull();
  });

  it('returns ACCOUNT_NOT_LINKED for a user without an account', async () => {
    const { token, user } = await createUserWithAccount({ withAccount: false });
    const body = await gql(FIND, { id: user.id }, token);
    expect(errorCode(body)).toBe('ACCOUNT_NOT_LINKED');
  });

  it('returns USER_NOT_FOUND for an unknown user id', async () => {
    const { token } = await createUserWithAccount({ withAccount: false });
    const body = await gql(FIND, { id: '507f1f77bcf86cd799439011' }, token);
    expect(errorCode(body)).toBe('USER_NOT_FOUND');
  });

  it('requires authentication to fetch an account', async () => {
    const body = await gql(FIND, { id: '507f1f77bcf86cd799439011' });
    expect(errorCode(body)).toBe('UNAUTHENTICATED');
  });

  it('lists all accounts', async () => {
    const first = await createUserWithAccount();
    await createUserWithAccount();
    const body = await gql(`query { accounts { id bankBalance } }`, undefined, first.token);
    expect(body.errors).toBeUndefined();
    expect(body.data.accounts).toHaveLength(2);
  });

  it('returns an error when no accounts exist', async () => {
    const { token } = await createUserWithAccount({ withAccount: false });
    const body = await gql(`query { accounts { id } }`, undefined, token);
    expect(errorCode(body)).toBe('ACCOUNT_NOT_FOUND');
  });
});

describe('editAccount', () => {
  const EDIT = `mutation ($id: ID!, $account: EditAccountInput!) {
    editAccount(id: $id, account: $account) { success account { bankBalance monthlyIncome } }
  }`;

  it('updates only the provided fields', async () => {
    const { token, accountId } = await createUserWithAccount();
    const body = await gql(EDIT, { id: accountId, account: { bankBalance: 42 } }, token);
    expect(body.errors).toBeUndefined();
    expect(body.data.editAccount).toEqual({
      success: true,
      account: { bankBalance: 42, monthlyIncome: 2000 }
    });
  });

  it('rejects an edit with no fields', async () => {
    const { token, accountId } = await createUserWithAccount();
    const body = await gql(EDIT, { id: accountId, account: {} }, token);
    expect(errorCode(body)).toBe('NO_VALID_FIELDS_PROVIDED');
  });

  it('returns ACCOUNT_NOT_FOUND for an unknown account', async () => {
    const { token } = await createUserWithAccount();
    const body = await gql(
      EDIT,
      { id: '507f1f77bcf86cd799439011', account: { bankBalance: 1 } },
      token
    );
    expect(errorCode(body)).toBe('ACCOUNT_NOT_FOUND');
  });
});

describe('deleteAccount', () => {
  it('deletes the account, its user and all children including notes', async () => {
    const { token, accountId } = await createUserWithAccount({
      account: {
        bills: [
          { name: 'Rent', amount: 1, paid: false },
          { name: 'Gas', amount: 1, paid: false }
        ],
        payday: { frequency: 'MONTHLY', type: 'LAST_DAY' }
      }
    });
    await gql(
      `mutation ($note: NoteInput!) { createNote(note: $note) { success } }`,
      { note: { account: accountId, body: 'bye' } },
      token
    );
    const body = await gql(
      `mutation ($id: ID!) { deleteAccount(id: $id) { success } }`,
      { id: accountId },
      token
    );
    expect(body.errors).toBeUndefined();
    expect(body.data.deleteAccount.success).toBe(true);
    for (const model of ['User', 'Account', 'Bill', 'Note', 'Payday']) {
      expect(await mongoose.model(model).countDocuments()).toBe(0);
    }
  });

  it('returns ACCOUNT_NOT_FOUND for an unknown account', async () => {
    const { token } = await createUserWithAccount();
    const body = await gql(
      `mutation ($id: ID!) { deleteAccount(id: $id) { success } }`,
      { id: '507f1f77bcf86cd799439011' },
      token
    );
    expect(errorCode(body)).toBe('ACCOUNT_NOT_FOUND');
  });
});

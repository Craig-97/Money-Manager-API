import mongoose from 'mongoose';
import {
  setupTestApp,
  teardownTestApp,
  clearDatabase,
  gql,
  errorCode,
  createUserWithAccount
} from '../../helpers';

beforeAll(setupTestApp);
afterAll(teardownTestApp);
beforeEach(clearDatabase);

const CREATE = `mutation ($input: CreateAccountInput!) {
  createAccount(input: $input) {
    success
    account {
      id bankBalance monthlyIncome
      user { id }
      oneOffPayments { name amount type category }
      recurringPayments { name }
      payday { frequency type }
    }
  }
}`;

const FIND = `query ($id: ID) {
  account(id: $id) {
    id bankBalance monthlyIncome
    user { id email }
    oneOffPayments { name amount }
    recurringPayments { name }
    notes { body }
    payday { frequency }
  }
}`;

const NOTE = `mutation ($input: CreateNoteInput!) { createNote(input: $input) { success } }`;

describe('createAccount', () => {
  it('creates an account with nested one-off payments and payday', async () => {
    const { token, user } = await createUserWithAccount({ withAccount: false });
    const body = await gql(
      CREATE,
      {
        input: {
          bankBalance: 1500.5,
          monthlyIncome: 3000,
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
      oneOffPayments: [{ name: 'Holiday', amount: 400, type: 'EXPENSE', category: 'TRAVEL' }],
      payday: { frequency: 'MONTHLY', type: 'LAST_DAY' }
    });
  });

  it('creates an account with several one-off and recurring payments in one transaction', async () => {
    const { token } = await createUserWithAccount({ withAccount: false });
    const payment = (name: string) => ({
      name,
      amount: 1,
      dueDate: '2030-01-01',
      type: 'EXPENSE',
      category: 'FOOD'
    });
    const body = await gql(
      CREATE,
      {
        input: {
          bankBalance: 1,
          monthlyIncome: 1,
          oneOffPayments: [payment('P1'), payment('P2'), payment('P3')],
          recurringPayments: ['R1', 'R2', 'R3'].map(name => ({
            name,
            amount: 1,
            category: 'OTHER',
            frequency: 'MONTHLY',
            type: 'EXPENSE',
            firstPaymentDate: '2030-01-01'
          }))
        }
      },
      token
    );
    expect(body.errors).toBeUndefined();
    const { account } = body.data.createAccount;
    expect(account.oneOffPayments.map((p: { name: string }) => p.name).sort()).toEqual(['P1', 'P2', 'P3']);
    expect(account.recurringPayments.map((p: { name: string }) => p.name).sort()).toEqual(['R1', 'R2', 'R3']);
  });

  it('creates an account with nested recurring payments', async () => {
    const { token } = await createUserWithAccount({ withAccount: false });
    const recurring = (name: string, category: string, amount: number) => ({
      name,
      amount,
      category,
      frequency: 'MONTHLY',
      type: 'EXPENSE',
      firstPaymentDate: '2030-01-01'
    });
    const body = await gql(
      `mutation ($input: CreateAccountInput!) {
        createAccount(input: $input) {
          account { recurringPayments { name amount category frequency type } }
        }
      }`,
      {
        input: {
          bankBalance: 1,
          monthlyIncome: 1,
          recurringPayments: [recurring('Mortgage', 'MORTGAGE', 750), recurring('Council tax', 'TAX', 160)]
        }
      },
      token
    );
    expect(body.errors).toBeUndefined();
    const { recurringPayments } = body.data.createAccount.account;
    expect(recurringPayments.map((p: { name: string }) => p.name).sort()).toEqual([
      'Council tax',
      'Mortgage'
    ]);
    expect(recurringPayments).toContainEqual({
      name: 'Council tax',
      amount: 160,
      category: 'TAX',
      frequency: 'MONTHLY',
      type: 'EXPENSE'
    });
    expect(await mongoose.model('RecurringPayment').countDocuments()).toBe(2);
  });

  it('links the account to the user', async () => {
    const { token, user, accountId } = await createUserWithAccount();
    const body = await gql(`query { tokenFindUser { account } }`, undefined, token);
    expect(body.data.tokenFindUser.account).toBe(accountId);
    expect(user.id).toBeDefined();
  });

  it('rejects a second account for the same user', async () => {
    const { token } = await createUserWithAccount();
    const body = await gql(CREATE, { input: { bankBalance: 1, monthlyIncome: 1 } }, token);
    expect(errorCode(body)).toBe('ACCOUNT_EXISTS');
  });

  it('only makes accounts for the signed-in user, so naming a user is a validation error', async () => {
    const { token } = await createUserWithAccount({ withAccount: false });
    const body = await gql(
      CREATE,
      { input: { userId: '507f1f77bcf86cd799439011', bankBalance: 1, monthlyIncome: 1 } },
      token
    );
    expect(body.errors).toBeDefined();
    expect(body.data).toBeUndefined();
    expect(await mongoose.model('Account').countDocuments()).toBe(0);
  });

  it('requires authentication', async () => {
    const body = await gql(CREATE, { input: { bankBalance: 1, monthlyIncome: 1 } });
    expect(errorCode(body)).toBe('UNAUTHENTICATED');
  });
});

describe('account queries', () => {
  it('finds an account by its id with populated, amount-sorted children', async () => {
    const { token, user, accountId } = await createUserWithAccount({
      account: {
        oneOffPayments: [
          { name: 'Big', amount: 900, dueDate: '2030-01-01', type: 'EXPENSE', category: 'FOOD' },
          { name: 'Small', amount: 10, dueDate: '2030-01-01', type: 'EXPENSE', category: 'FOOD' }
        ]
      }
    });
    await gql(NOTE, { input: { accountId, body: 'Remember' } }, token);
    const body = await gql(FIND, { id: accountId }, token);
    expect(body.errors).toBeUndefined();
    const account = body.data.account;
    expect(account.id).toBe(accountId);
    expect(account.user).toMatchObject({ id: user.id, email: user.email });
    expect(account.oneOffPayments.map((p: { name: string }) => p.name)).toEqual(['Small', 'Big']);
    expect(account.notes).toEqual([{ body: 'Remember' }]);
    expect(account.payday).toBeNull();
  });

  it("finds the user's default account when no id is given", async () => {
    const { token, accountId } = await createUserWithAccount();
    const body = await gql(FIND, {}, token);
    expect(body.errors).toBeUndefined();
    expect(body.data.account.id).toBe(accountId);
  });

  it('ignores the id lists accounts used to store', async () => {
    const { token, accountId } = await createUserWithAccount();
    await gql(NOTE, { input: { accountId, body: 'Remember' } }, token);
    // Accounts saved before the switch to virtuals still carry these until they're cleaned up
    const stale = new mongoose.Types.ObjectId();
    await mongoose.connection.collection('accounts').updateOne(
      { _id: new mongoose.Types.ObjectId(accountId) },
      {
        $set: {
          bills: [stale],
          notes: [stale],
          oneOffPayments: [stale],
          recurringPayments: [stale],
          payday: stale
        }
      }
    );
    const body = await gql(FIND, { id: accountId }, token);
    expect(body.errors).toBeUndefined();
    expect(body.data.account.notes).toEqual([{ body: 'Remember' }]);
    expect(body.data.account.oneOffPayments).toEqual([]);
    expect(body.data.account.payday).toBeNull();
  });

  it('returns ACCOUNT_NOT_LINKED for a user without an account', async () => {
    const { token } = await createUserWithAccount({ withAccount: false });
    const body = await gql(FIND, {}, token);
    expect(errorCode(body)).toBe('ACCOUNT_NOT_LINKED');
  });

  it("refuses another user's account id", async () => {
    const owner = await createUserWithAccount();
    const other = await createUserWithAccount();
    const body = await gql(FIND, { id: owner.accountId }, other.token);
    expect(errorCode(body)).toBe('FORBIDDEN');
  });

  it("refuses an account id that doesn't exist, the same as someone else's", async () => {
    const { token } = await createUserWithAccount();
    const body = await gql(FIND, { id: '507f1f77bcf86cd799439011' }, token);
    expect(errorCode(body)).toBe('FORBIDDEN');
  });

  it('refuses a malformed id', async () => {
    const { token } = await createUserWithAccount();
    const body = await gql(FIND, { id: 'not-an-id' }, token);
    expect(errorCode(body)).toBe('FORBIDDEN');
  });

  it("refuses the user's own user id, as it isn't an account id", async () => {
    const { token, user } = await createUserWithAccount();
    const body = await gql(FIND, { id: user.id }, token);
    expect(errorCode(body)).toBe('FORBIDDEN');
  });

  it('requires authentication to fetch an account', async () => {
    const body = await gql(FIND, { id: '507f1f77bcf86cd799439011' });
    expect(errorCode(body)).toBe('UNAUTHENTICATED');
  });
});

describe('updateAccount', () => {
  const UPDATE = `mutation ($id: ID!, $input: UpdateAccountInput!) {
    updateAccount(id: $id, input: $input) { success account { bankBalance monthlyIncome } }
  }`;

  it('updates only the provided fields', async () => {
    const { token, accountId } = await createUserWithAccount();
    const body = await gql(UPDATE, { id: accountId, input: { bankBalance: 42 } }, token);
    expect(body.errors).toBeUndefined();
    expect(body.data.updateAccount).toEqual({
      success: true,
      account: { bankBalance: 42, monthlyIncome: 2000 }
    });
  });

  it('returns whatever is selected on the account', async () => {
    const { token, accountId } = await createUserWithAccount();
    await gql(NOTE, { input: { accountId, body: 'Kept' } }, token);
    const body = await gql(
      `mutation ($id: ID!, $input: UpdateAccountInput!) {
        updateAccount(id: $id, input: $input) { account { monthlyIncome notes { body } } }
      }`,
      { id: accountId, input: { monthlyIncome: 2500 } },
      token
    );
    expect(body.errors).toBeUndefined();
    expect(body.data.updateAccount.account).toEqual({ monthlyIncome: 2500, notes: [{ body: 'Kept' }] });
  });

  it('rejects an update with no fields', async () => {
    const { token, accountId } = await createUserWithAccount();
    const body = await gql(UPDATE, { id: accountId, input: {} }, token);
    expect(errorCode(body)).toBe('NO_VALID_FIELDS_PROVIDED');
  });

  it('refuses an account that is not the signed-in user\'s', async () => {
    const { token } = await createUserWithAccount();
    const body = await gql(
      UPDATE,
      { id: '507f1f77bcf86cd799439011', input: { bankBalance: 1 } },
      token
    );
    // Refused before looking it up, the same as someone else's account
    expect(errorCode(body)).toBe('FORBIDDEN');
  });
});

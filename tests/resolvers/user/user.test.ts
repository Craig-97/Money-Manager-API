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

const USER_FIELDS = 'id email firstName surname account';

describe('registerAndLogin', () => {
  const REGISTER = `mutation ($input: RegisterInput!) { registerAndLogin(input: $input) { user { ${USER_FIELDS} } } }`;

  it('registers a user without an account', async () => {
    const body = await gql(REGISTER, {
      input: { email: 'second@example.com', password: 'Password1', firstName: 'S', surname: 'U' }
    });
    expect(body.errors).toBeUndefined();
    expect(body.data.registerAndLogin.user.account).toBeNull();
  });

  it("rejects an account in the input with a validation error, so nobody can join someone else's", async () => {
    const { accountId, token } = await createUserWithAccount();
    const body = await gql(REGISTER, {
      input: { email: 'x@example.com', password: 'Password1', firstName: 'S', surname: 'U', account: accountId }
    });
    expect(body.errors).toBeDefined();
    expect(body.data).toBeUndefined();
    expect(await mongoose.model('User').countDocuments({ email: 'x@example.com' })).toBe(0);

    const owner = await gql(`query { tokenFindUser { account } }`, undefined, token);
    expect(owner.data.tokenFindUser.account).toBe(accountId);
  });
});

const LOGIN = `mutation ($email: String!, $password: String!) { login(email: $email, password: $password) { token } }`;

describe('updateCurrentUser', () => {
  const UPDATE = `mutation ($input: UserDetailsInput!) {
    updateCurrentUser(input: $input) { success user { firstName surname email } }
  }`;

  it("changes the signed-in user's name and email", async () => {
    const { token } = await createUserWithAccount();

    const body = await gql(
      UPDATE,
      { input: { firstName: ' Sam ', surname: 'Jones', email: 'sam@example.com' } },
      token
    );

    expect(body.data.updateCurrentUser).toEqual({
      success: true,
      user: { firstName: 'Sam', surname: 'Jones', email: 'sam@example.com' }
    });
  });

  it('refuses an email someone else uses', async () => {
    const first = await createUserWithAccount();
    const second = await createUserWithAccount();

    const body = await gql(UPDATE, { input: { firstName: 'A', surname: 'B', email: first.email } }, second.token);

    expect(errorCode(body)).toBe('USER_EXISTS');
  });

  it('needs a session', async () => {
    const body = await gql(UPDATE, { input: { firstName: 'A', surname: 'B', email: 'a@b.com' } });
    expect(errorCode(body)).toBe('UNAUTHENTICATED');
  });
});

describe('changePassword', () => {
  const CHANGE = `mutation ($current: String!, $next: String!) {
    changePassword(currentPassword: $current, newPassword: $next) { success }
  }`;

  it('changes the password when the current one is right', async () => {
    const { token, email, password } = await createUserWithAccount();

    const body = await gql(CHANGE, { current: password, next: 'newpass123' }, token);

    expect(body.data.changePassword.success).toBe(true);
    expect((await gql(LOGIN, { email, password: 'newpass123' })).errors).toBeUndefined();
    expect(errorCode(await gql(LOGIN, { email, password }))).toBe('INVALID_CREDENTIALS');
  });

  it('refuses a wrong current password', async () => {
    const { token } = await createUserWithAccount();
    const body = await gql(CHANGE, { current: 'wrong', next: 'newpass123' }, token);
    expect(errorCode(body)).toBe('INVALID_CREDENTIALS');
  });

  it('refuses a new password that breaks the rules', async () => {
    const { token, password } = await createUserWithAccount();
    const body = await gql(CHANGE, { current: password, next: 'short' }, token);
    expect(errorCode(body)).toBe('INVALID_PASSWORD');
  });

  it('needs a session', async () => {
    const body = await gql(CHANGE, { current: 'Password123!', next: 'newpass123' });
    expect(errorCode(body)).toBe('UNAUTHENTICATED');
  });
});

describe('deleteCurrentUser', () => {
  const DELETE_ME = `mutation { deleteCurrentUser { success } }`;

  it('deletes the signed-in user only', async () => {
    const { token, email, password } = await createUserWithAccount();
    const other = await createUserWithAccount();

    const body = await gql(DELETE_ME, undefined, token);

    expect(body.data.deleteCurrentUser.success).toBe(true);
    expect(errorCode(await gql(LOGIN, { email, password }))).toBe('USER_EMAIL_NOT_FOUND');
    expect((await gql(LOGIN, { email: other.email, password: other.password })).errors).toBeUndefined();
  });

  it('deletes the account and everything on it', async () => {
    const { token, user, accountId } = await createUserWithAccount({
      account: {
        oneOffPayments: [{ name: 'Gift', amount: 20, dueDate: '2030-01-01', type: 'EXPENSE', category: 'OTHER' }],
        recurringPayments: [
          {
            name: 'Rent',
            amount: 500,
            category: 'RENT',
            frequency: 'MONTHLY',
            type: 'EXPENSE',
            firstPaymentDate: '2030-01-01'
          }
        ],
        payday: { frequency: 'MONTHLY', type: 'LAST_DAY' }
      }
    });
    await gql(
      `mutation ($input: CreateNoteInput!) { createNote(input: $input) { success } }`,
      { input: { accountId, body: 'bye' } },
      token
    );
    const other = await createUserWithAccount();
    const children = ['Note', 'OneOffPayment', 'RecurringPayment', 'Payday'];
    const count = (model: string, filter: object) => mongoose.model(model).countDocuments(filter);
    for (const model of children) {
      expect(await count(model, { account: accountId })).toBe(1);
    }

    const body = await gql(DELETE_ME, undefined, token);

    expect(body.errors).toBeUndefined();
    expect(await count('User', { _id: user.id })).toBe(0);
    expect(await count('Account', { _id: accountId })).toBe(0);
    for (const model of children) {
      expect(await count(model, { account: accountId })).toBe(0);
    }
    // Someone else's account is left alone
    expect(await count('Account', { _id: other.accountId })).toBe(1);
  });
});

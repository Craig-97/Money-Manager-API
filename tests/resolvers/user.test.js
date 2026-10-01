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

const USER_FIELDS = 'id email firstName surname account';

describe('user queries and mutations', () => {
  it('lists users', async () => {
    await createUserWithAccount({ withAccount: false });
    await createUserWithAccount({ withAccount: false });
    const body = await gql(`query { users { ${USER_FIELDS} } }`);
    expect(body.errors).toBeUndefined();
    expect(body.data.users).toHaveLength(2);
  });

  it('finds a user by id', async () => {
    const { user } = await createUserWithAccount({ withAccount: false });
    const body = await gql(`query ($id: ID) { user(id: $id) { ${USER_FIELDS} } }`, { id: user.id });
    expect(body.data.user.email).toBe(user.email);
  });

  it('returns USER_NOT_FOUND for an unknown id', async () => {
    const body = await gql(`query ($id: ID) { user(id: $id) { id } }`, {
      id: '507f1f77bcf86cd799439011'
    });
    expect(errorCode(body)).toBe('USER_NOT_FOUND');
  });

  it('createUser links the user to an existing account', async () => {
    const { accountId, user: owner } = await createUserWithAccount();
    const body = await gql(
      `mutation ($user: UserInput!) { createUser(user: $user) { success user { id account } } }`,
      {
        user: {
          email: 'second@example.com',
          password: 'pw',
          firstName: 'S',
          surname: 'U',
          account: accountId
        }
      }
    );
    expect(body.errors).toBeUndefined();
    expect(body.data.createUser.success).toBe(true);
    expect(body.data.createUser.user.account).toBe(accountId);
    expect(owner.id).toBeDefined();
  });

  it('createUser fails when the linked account does not exist', async () => {
    const body = await gql(
      `mutation ($user: UserInput!) { createUser(user: $user) { success } }`,
      {
        user: {
          email: 'x@example.com',
          password: 'pw',
          firstName: 'S',
          surname: 'U',
          account: '507f1f77bcf86cd799439011'
        }
      }
    );
    expect(errorCode(body)).toBe('ACCOUNT_NOT_FOUND');
  });

  it('editUser updates fields and the new password works for login', async () => {
    const { token, user, email } = await createUserWithAccount({ withAccount: false });
    const edit = await gql(
      `mutation ($id: ID!, $user: UserInput!) {
        editUser(id: $id, user: $user) { success user { ${USER_FIELDS} } }
      }`,
      {
        id: user.id,
        user: { email, password: 'NewPassword1', firstName: 'Changed', surname: 'Name' }
      },
      token
    );
    expect(edit.errors).toBeUndefined();
    expect(edit.data.editUser.success).toBe(true);
    expect(edit.data.editUser.user.firstName).toBe('Changed');

    const login = await gql(
      `query ($email: String!, $password: String!) { login(email: $email, password: $password) { token } }`,
      { email, password: 'NewPassword1' }
    );
    expect(login.errors).toBeUndefined();
  });

  it('editUser requires authentication', async () => {
    const { user, email } = await createUserWithAccount({ withAccount: false });
    const body = await gql(
      `mutation ($id: ID!, $user: UserInput!) { editUser(id: $id, user: $user) { success } }`,
      { id: user.id, user: { email, password: 'x', firstName: 'a', surname: 'b' } }
    );
    expect(errorCode(body)).toBe('UNAUTHENTICATED');
  });

  it('deleteUser removes the user, their account and its children', async () => {
    const { token, user, accountId } = await createUserWithAccount();
    await gql(
      `mutation ($bill: BillInput!) { createBill(bill: $bill) { success } }`,
      { bill: { account: accountId, name: 'Rent', amount: 500, paid: false } },
      token
    );
    const body = await gql(
      `mutation ($id: ID!) { deleteUser(id: $id) { success } }`,
      { id: user.id },
      token
    );
    expect(body.errors).toBeUndefined();
    expect(body.data.deleteUser.success).toBe(true);

    expect(await mongoose.model('User').countDocuments()).toBe(0);
    expect(await mongoose.model('Account').countDocuments()).toBe(0);
    expect(await mongoose.model('Bill').countDocuments()).toBe(0);
  });

  it('deleteUser returns USER_NOT_FOUND for an unknown id', async () => {
    const { token } = await createUserWithAccount({ withAccount: false });
    const body = await gql(
      `mutation ($id: ID!) { deleteUser(id: $id) { success } }`,
      { id: '507f1f77bcf86cd799439011' },
      token
    );
    expect(errorCode(body)).toBe('USER_NOT_FOUND');
  });
});


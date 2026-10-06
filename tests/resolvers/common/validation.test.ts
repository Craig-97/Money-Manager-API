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

const REGISTER = `mutation ($input: RegisterInput!) {
  registerAndLogin(input: $input) { user { email firstName surname } }
}`;
const user = { email: 'new@example.com', password: 'Password1', firstName: 'Ann', surname: 'Lee' };

describe('registering', () => {
  it('trims names and email before saving them', async () => {
    const body = await gql(REGISTER, {
      input: { ...user, email: '  new@example.com ', firstName: ' Ann ', surname: 'Lee  ' }
    });
    expect(body.data.registerAndLogin.user).toEqual({ email: 'new@example.com', firstName: 'Ann', surname: 'Lee' });
  });

  it.each([
    ['an email that is not an email', { email: 'not-an-email' }, 'email'],
    ['an empty first name', { firstName: '   ' }, 'firstName'],
    ['a surname over 50 characters', { surname: 'x'.repeat(51) }, 'surname']
  ])('rejects %s, naming the field', async (_, change, field) => {
    const body = await gql(REGISTER, { input: { ...user, ...change } });
    expect(errorCode(body)).toBe('BAD_USER_INPUT');
    expect(body.errors?.[0].extensions?.field).toBe(field);
  });

  it.each(['short1', 'nonumbers', `${'a'.repeat(72)}1`])('rejects the password %s', async password => {
    expect(errorCode(await gql(REGISTER, { input: { ...user, password } }))).toBe('INVALID_PASSWORD');
  });
});

describe('profile changes', () => {
  it('rejects an invalid email when updating details', async () => {
    const { token } = await createUserWithAccount({ withAccount: false });
    const body = await gql(
      `mutation ($input: UserDetailsInput!) { updateCurrentUser(input: $input) { success } }`,
      { input: { firstName: 'A', surname: 'B', email: 'nope' } },
      token
    );
    expect(errorCode(body)).toBe('BAD_USER_INPUT');
  });
});

describe('accounts', () => {
  const CREATE = `mutation ($input: CreateAccountInput!) { createAccount(input: $input) { success } }`;

  it('rejects a balance over a billion', async () => {
    const { token } = await createUserWithAccount({ withAccount: false });
    const body = await gql(CREATE, { input: { bankBalance: 2e9, monthlyIncome: 1 } }, token);
    expect(errorCode(body)).toBe('BAD_USER_INPUT');
    expect(body.errors?.[0].extensions?.field).toBe('bankBalance');
  });

  it('allows an overdrawn balance', async () => {
    const { token } = await createUserWithAccount({ withAccount: false });
    const body = await gql(CREATE, { input: { bankBalance: -250, monthlyIncome: 1 } }, token);
    expect(body.errors).toBeUndefined();
  });

  it('rejects a negative amount on a payment set up with the account', async () => {
    const { token } = await createUserWithAccount({ withAccount: false });
    const body = await gql(
      CREATE,
      {
        input: {
          bankBalance: 1,
          monthlyIncome: 1,
          oneOffPayments: [{ name: 'Gift', amount: -5, dueDate: '2030-01-01', type: 'EXPENSE', category: 'OTHER' }]
        }
      },
      token
    );
    expect(errorCode(body)).toBe('BAD_USER_INPUT');
    expect(body.errors?.[0].extensions?.field).toBe('oneOffPayments.0.amount');
  });

  it('rejects a payday that is not a real date', async () => {
    const { token, accountId } = await createUserWithAccount();
    const body = await gql(
      `mutation ($input: StartPaydayCycleInput!) { startPaydayCycle(input: $input) { success } }`,
      { input: { accountId, payday: '2030-02-30', bankBalance: 1, recurringPaymentIds: [] } },
      token
    );
    expect(errorCode(body)).toBe('BAD_USER_INPUT');
  });
});

describe('payments and notes', () => {
  it('rejects a one-off payment due on a date that does not exist', async () => {
    const { token, accountId } = await createUserWithAccount();
    const body = await gql(
      `mutation ($input: CreateOneOffPaymentInput!) { createOneOffPayment(input: $input) { success } }`,
      { input: { accountId, name: 'Trip', amount: 1, dueDate: '2030-13-01', type: 'EXPENSE', category: 'OTHER' } },
      token
    );
    expect(errorCode(body)).toBe('BAD_USER_INPUT');
  });

  it('trims a recurring payment name, and rejects a blank one', async () => {
    const { token, accountId } = await createUserWithAccount();
    const CREATE = `mutation ($input: CreateRecurringPaymentInput!) {
      createRecurringPayment(input: $input) { recurringPayment { name } }
    }`;
    const input = {
      accountId,
      amount: 10,
      category: 'RENT',
      frequency: 'MONTHLY',
      type: 'EXPENSE',
      firstPaymentDate: '2030-01-01'
    };
    const ok = await gql(CREATE, { input: { ...input, name: '  Rent  ' } }, token);
    expect(ok.data.createRecurringPayment.recurringPayment.name).toBe('Rent');
    expect(errorCode(await gql(CREATE, { input: { ...input, name: ' ' } }, token))).toBe('BAD_USER_INPUT');
  });

  it('rejects an empty note and one over 2000 characters', async () => {
    const { token, accountId } = await createUserWithAccount();
    const CREATE = `mutation ($input: CreateNoteInput!) { createNote(input: $input) { success } }`;
    expect(errorCode(await gql(CREATE, { input: { accountId, body: '  ' } }, token))).toBe('BAD_USER_INPUT');
    expect(errorCode(await gql(CREATE, { input: { accountId, body: 'x'.repeat(2001) } }, token))).toBe(
      'BAD_USER_INPUT'
    );
  });
});

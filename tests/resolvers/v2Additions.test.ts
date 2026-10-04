import { setupTestApp, teardownTestApp, clearDatabase, gql, errorCode, createUserWithAccount } from '../helpers';

beforeAll(setupTestApp);
afterAll(teardownTestApp);
beforeEach(clearDatabase);

const LOGIN = `query ($email: String!, $password: String!) { login(email: $email, password: $password) { token } }`;

describe('one-off payments paid', () => {
  const CREATE = `mutation ($p: OneOffPaymentInput!) {
    createOneOffPayment(oneOffPayment: $p) { oneOffPayment { id paid } }
  }`;
  const BATCH = `mutation ($ids: [ID!]!, $paid: Boolean!) {
    batchUpdateOneOffPayments(ids: $ids, paid: $paid) { success updatedCount oneOffPayments { id paid } }
  }`;

  const create = async (token: string, account: string, name: string) =>
    (
      await gql(
        CREATE,
        { p: { account, name, amount: 5, dueDate: '2030-01-01', type: 'EXPENSE', category: 'OTHER' } },
        token
      )
    ).data.createOneOffPayment.oneOffPayment;

  it('starts unpaid', async () => {
    const { token, accountId } = await createUserWithAccount();
    expect((await create(token, accountId, 'Birthday')).paid).toBe(false);
  });

  it('marks several paid at once', async () => {
    const { token, accountId } = await createUserWithAccount();
    const a = await create(token, accountId, 'A');
    const b = await create(token, accountId, 'B');

    const body = await gql(BATCH, { ids: [a.id, b.id], paid: true }, token);

    expect(body.data.batchUpdateOneOffPayments).toMatchObject({ success: true, updatedCount: 2 });
    expect(body.data.batchUpdateOneOffPayments.oneOffPayments.every((p: { paid: boolean }) => p.paid)).toBe(
      true
    );
  });

  it("refuses another user's payments", async () => {
    const owner = await createUserWithAccount();
    const other = await createUserWithAccount();
    const theirs = await create(owner.token, owner.accountId, 'Theirs');

    const body = await gql(BATCH, { ids: [theirs.id], paid: true }, other.token);

    expect(errorCode(body)).toBe('FORBIDDEN');
  });
});

describe('note colours', () => {
  const CREATE = `mutation ($note: NoteInput!) { createNote(note: $note) { note { id color } } }`;
  const EDIT = `mutation ($id: ID!, $note: NoteInput!) { editNote(id: $id, note: $note) { note { color body } } }`;

  it('defaults to blue and can be changed', async () => {
    const { token, accountId } = await createUserWithAccount();
    const created = await gql(CREATE, { note: { account: accountId, body: 'Hi' } }, token);
    const { id, color } = created.data.createNote.note;
    expect(color).toBe('BLUE');

    const edited = await gql(EDIT, { id, note: { color: 'ROSE' } }, token);

    expect(edited.data.editNote.note).toEqual({ color: 'ROSE', body: 'Hi' });
  });
});

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

  it("refuses an email someone else uses", async () => {
    const first = await createUserWithAccount();
    const second = await createUserWithAccount();

    const body = await gql(
      UPDATE,
      { input: { firstName: 'A', surname: 'B', email: first.email } },
      second.token
    );

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
});

describe('deleteCurrentUser', () => {
  it('deletes the signed-in user only', async () => {
    const { token, email, password } = await createUserWithAccount();
    const other = await createUserWithAccount();

    const body = await gql(`mutation { deleteCurrentUser { success } }`, undefined, token);

    expect(body.data.deleteCurrentUser.success).toBe(true);
    expect(errorCode(await gql(LOGIN, { email, password }))).toBe('USER_EMAIL_NOT_FOUND');
    expect(
      (await gql(LOGIN, { email: other.email, password: other.password })).errors
    ).toBeUndefined();
  });
});

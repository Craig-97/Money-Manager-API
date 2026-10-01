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
} from '../helpers';

beforeAll(setupTestApp);
afterAll(teardownTestApp);
beforeEach(clearDatabase);

const FIELDS = 'id account frequency type dayOfMonth weekday firstPayDate bankHolidayRegion';
const CREATE = `mutation ($payday: PaydayInput!) {
  createPayday(payday: $payday) { success payday { ${FIELDS} } }
}`;
const UNKNOWN = '507f1f77bcf86cd799439011';

const makePayday = (token: string | undefined, accountId: string, extra: Variables = {}) =>
  gql(
    CREATE,
    { payday: { account: accountId, frequency: 'MONTHLY', type: 'SET_DAY', dayOfMonth: 25, ...extra } },
    token
  );

const idOf = (body: GqlBody) => body.data.createPayday.payday.id;

describe('createPayday', () => {
  it('creates a payday and links it to the account', async () => {
    const { token, accountId } = await createUserWithAccount();
    const body = await makePayday(token, accountId, {
      firstPayDate: '2030-01-25',
      bankHolidayRegion: 'SCOTLAND'
    });
    expect(body.errors).toBeUndefined();
    const { success, payday } = body.data.createPayday;
    expect(success).toBe(true);
    expect(payday).toMatchObject({
      account: accountId,
      frequency: 'MONTHLY',
      type: 'SET_DAY',
      dayOfMonth: 25,
      weekday: null,
      firstPayDate: '2030-01-25',
      bankHolidayRegion: 'SCOTLAND'
    });
    const account = await mongoose.model('Account').findById(accountId);
    expect(String(account.payday)).toBe(payday.id);
  });

  it('rejects a second payday for the same account', async () => {
    const { token, accountId } = await createUserWithAccount();
    await makePayday(token, accountId);
    const body = await makePayday(token, accountId);
    expect(errorCode(body)).toBe('PAYDAY_EXISTS');
  });

  it('rejects an invalid firstPayDate format', async () => {
    const { token, accountId } = await createUserWithAccount();
    const body = await makePayday(token, accountId, { firstPayDate: '25/01/2030' });
    expect(body.errors).toBeDefined();
    expect(body.errors?.[0].message).toMatch(/valid date format/);
  });

  it('rejects a dayOfMonth out of range', async () => {
    const { token, accountId } = await createUserWithAccount();
    const body = await makePayday(token, accountId, { dayOfMonth: 40 });
    expect(body.errors).toBeDefined();
  });

  it('returns FORBIDDEN for another users account', async () => {
    const owner = await createUserWithAccount();
    const other = await createUserWithAccount();
    const body = await makePayday(other.token, owner.accountId);
    expect(errorCode(body)).toBe('FORBIDDEN');
  });

  it('requires authentication', async () => {
    const { accountId } = await createUserWithAccount();
    const body = await makePayday(undefined, accountId);
    expect(errorCode(body)).toBe('UNAUTHENTICATED');
  });
});

describe('payday queries', () => {
  it('lists the paydays for the callers account', async () => {
    const { token, accountId } = await createUserWithAccount();
    await makePayday(token, accountId);
    const body = await gql(`query { paydays { id frequency } }`, undefined, token);
    expect(body.errors).toBeUndefined();
    expect(body.data.paydays).toHaveLength(1);
  });

  it('returns an empty list when the account has no payday', async () => {
    const { token } = await createUserWithAccount();
    const body = await gql(`query { paydays { id } }`, undefined, token);
    expect(body.errors).toBeUndefined();
    expect(body.data.paydays).toEqual([]);
  });

  it('only returns the callers paydays', async () => {
    const owner = await createUserWithAccount();
    const other = await createUserWithAccount();
    await makePayday(owner.token, owner.accountId);
    const body = await gql(`query { paydays { id } }`, undefined, other.token);
    expect(body.data.paydays).toEqual([]);
  });

  it('finds a payday by id', async () => {
    const { token, accountId } = await createUserWithAccount();
    const created = await makePayday(token, accountId);
    const body = await gql(
      `query ($id: ID) { payday(id: $id) { ${FIELDS} } }`,
      { id: idOf(created) },
      token
    );
    expect(body.data.payday.frequency).toBe('MONTHLY');
  });

  it('returns PAYDAY_NOT_FOUND for an unknown id', async () => {
    const { token } = await createUserWithAccount();
    const body = await gql(`query ($id: ID) { payday(id: $id) { id } }`, { id: UNKNOWN }, token);
    expect(errorCode(body)).toBe('PAYDAY_NOT_FOUND');
  });

  it('returns FORBIDDEN for another users payday', async () => {
    const owner = await createUserWithAccount();
    const other = await createUserWithAccount();
    const created = await makePayday(owner.token, owner.accountId);
    const body = await gql(
      `query ($id: ID) { payday(id: $id) { id } }`,
      { id: idOf(created) },
      other.token
    );
    expect(errorCode(body)).toBe('FORBIDDEN');
  });
});

describe('editPayday', () => {
  const EDIT = `mutation ($id: ID!, $payday: PaydayInput!) {
    editPayday(id: $id, payday: $payday) { success payday { ${FIELDS} } }
  }`;

  it('updates the payday', async () => {
    const { token, accountId } = await createUserWithAccount();
    const created = await makePayday(token, accountId);
    const body = await gql(
      EDIT,
      {
        id: idOf(created),
        payday: { frequency: 'WEEKLY', type: 'SET_WEEKDAY', weekday: 'FRIDAY' }
      },
      token
    );
    expect(body.errors).toBeUndefined();
    expect(body.data.editPayday.payday).toMatchObject({
      frequency: 'WEEKLY',
      type: 'SET_WEEKDAY',
      weekday: 'FRIDAY',
      dayOfMonth: 25
    });
  });

  it('returns PAYDAY_NOT_FOUND for an unknown id', async () => {
    const { token } = await createUserWithAccount();
    const body = await gql(
      EDIT,
      { id: UNKNOWN, payday: { frequency: 'WEEKLY', type: 'LAST_DAY' } },
      token
    );
    expect(errorCode(body)).toBe('PAYDAY_NOT_FOUND');
  });

  it('returns FORBIDDEN for another users payday', async () => {
    const owner = await createUserWithAccount();
    const other = await createUserWithAccount();
    const created = await makePayday(owner.token, owner.accountId);
    const body = await gql(
      EDIT,
      { id: idOf(created), payday: { frequency: 'WEEKLY', type: 'LAST_DAY' } },
      other.token
    );
    expect(errorCode(body)).toBe('FORBIDDEN');
  });
});

describe('deletePayday', () => {
  const DELETE = `mutation ($id: ID!) { deletePayday(id: $id) { success payday { id } } }`;

  it('deletes the payday and unlinks it from the account', async () => {
    const { token, accountId } = await createUserWithAccount();
    const created = await makePayday(token, accountId);
    const id = idOf(created);
    const body = await gql(DELETE, { id }, token);
    expect(body.errors).toBeUndefined();
    expect(body.data.deletePayday).toEqual({ success: true, payday: { id } });
    expect(await mongoose.model('Payday').countDocuments()).toBe(0);
    const account = await mongoose.model('Account').findById(accountId);
    expect(account.payday).toBeUndefined();
  });

  it('returns PAYDAY_NOT_FOUND for an unknown id', async () => {
    const { token } = await createUserWithAccount();
    const body = await gql(DELETE, { id: UNKNOWN }, token);
    expect(errorCode(body)).toBe('PAYDAY_NOT_FOUND');
  });

  it('returns FORBIDDEN for another users payday', async () => {
    const owner = await createUserWithAccount();
    const other = await createUserWithAccount();
    const created = await makePayday(owner.token, owner.accountId);
    const body = await gql(DELETE, { id: idOf(created) }, other.token);
    expect(errorCode(body)).toBe('FORBIDDEN');
  });
});

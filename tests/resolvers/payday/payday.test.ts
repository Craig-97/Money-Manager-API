import mongoose from 'mongoose';
import {
  setupTestApp,
  teardownTestApp,
  clearDatabase,
  gql,
  errorCode,
  createUserWithAccount,
  Variables
} from '../../helpers';

beforeAll(setupTestApp);
afterAll(teardownTestApp);
beforeEach(clearDatabase);

const FIELDS =
  'id account frequency type dayOfMonth weekday firstPayDate bankHolidayRegion overrides { for date }';
const UNKNOWN = '507f1f77bcf86cd799439011';
const PAYDAY = { frequency: 'MONTHLY', type: 'SET_DAY', dayOfMonth: 25 };

const CREATE_ACCOUNT = `mutation ($input: CreateAccountInput!) {
  createAccount(input: $input) { success account { payday { ${FIELDS} } } }
}`;

// A payday is set up alongside its account, so this registers a user and makes the account with one
const makePayday = async (extra: Variables = {}) => {
  const { token } = await createUserWithAccount({ withAccount: false });
  const body = await gql(
    CREATE_ACCOUNT,
    { input: { bankBalance: 1, monthlyIncome: 1, payday: { ...PAYDAY, ...extra } } },
    token
  );
  return { token, body };
};

// A user with an account and a payday, and that payday's id
const withPayday = async () => {
  const { token } = await createUserWithAccount({ account: { payday: PAYDAY } });
  const body = await gql(`query { account { payday { id } } }`, undefined, token);
  return { token, id: body.data.account.payday.id as string };
};

describe('payday on createAccount', () => {
  it('creates a payday and links it to the account', async () => {
    const { token, body } = await makePayday({
      firstPayDate: '2030-01-25',
      bankHolidayRegion: 'SCOTLAND'
    });
    expect(body.errors).toBeUndefined();
    const { payday } = body.data.createAccount.account;
    expect(payday).toMatchObject({
      frequency: 'MONTHLY',
      type: 'SET_DAY',
      dayOfMonth: 25,
      weekday: null,
      firstPayDate: '2030-01-25',
      bankHolidayRegion: 'SCOTLAND',
      overrides: []
    });
    const read = await gql(`query { account { id payday { ${FIELDS} } } }`, undefined, token);
    expect(read.data.account.payday).toEqual(payday);
    expect(payday.account).toBe(read.data.account.id);
    const account = await mongoose.model('Account').findById(read.data.account.id).populate('payday');
    expect(account.payday.id).toBe(payday.id);
  });

  it('rejects an invalid firstPayDate format', async () => {
    const { body } = await makePayday({ firstPayDate: '25/01/2030' });
    expect(errorCode(body)).toBe('BAD_USER_INPUT');
    expect(body.errors?.[0].message).toMatch(/YYYY-MM-DD/);
  });

  it('rejects a dayOfMonth out of range', async () => {
    const { body } = await makePayday({ dayOfMonth: 40 });
    expect(body.errors).toBeDefined();
    expect(await mongoose.model('Payday').countDocuments()).toBe(0);
  });
});

describe('updatePayday', () => {
  const UPDATE = `mutation ($id: ID!, $input: PaydayInput!) {
    updatePayday(id: $id, input: $input) { success payday { ${FIELDS} } }
  }`;

  it('updates the payday', async () => {
    const { token, id } = await withPayday();
    const body = await gql(
      UPDATE,
      {
        id,
        input: { frequency: 'WEEKLY', type: 'SET_WEEKDAY', weekday: 'FRIDAY' }
      },
      token
    );
    expect(body.errors).toBeUndefined();
    expect(body.data.updatePayday.payday).toMatchObject({
      frequency: 'WEEKLY',
      type: 'SET_WEEKDAY',
      weekday: 'FRIDAY',
      dayOfMonth: 25
    });
  });

  it('returns PAYDAY_NOT_FOUND for an unknown id', async () => {
    const { token } = await createUserWithAccount();
    const body = await gql(
      UPDATE,
      { id: UNKNOWN, input: { frequency: 'WEEKLY', type: 'LAST_DAY' } },
      token
    );
    expect(errorCode(body)).toBe('PAYDAY_NOT_FOUND');
  });

  it('returns FORBIDDEN for another users payday', async () => {
    const owner = await withPayday();
    const other = await createUserWithAccount();
    const body = await gql(
      UPDATE,
      { id: owner.id, input: { frequency: 'WEEKLY', type: 'LAST_DAY' } },
      other.token
    );
    expect(errorCode(body)).toBe('FORBIDDEN');
  });
});

describe('setPaydayOverride', () => {
  const SET = `mutation ($id: ID!, $for: String!, $date: String) {
    setPaydayOverride(id: $id, for: $for, date: $date) { success payday { ${FIELDS} } }
  }`;
  const inDays = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

  it('starts with no overrides', async () => {
    const { token } = await withPayday();
    const body = await gql(`query { account { payday { overrides { for date } } } }`, undefined, token);
    expect(body.data.account.payday.overrides).toEqual([]);
  });

  it('moves one payday', async () => {
    const { token, id } = await withPayday();
    const body = await gql(SET, { id, for: inDays(20), date: inDays(13) }, token);
    expect(body.errors).toBeUndefined();
    expect(body.data.setPaydayOverride.payday.overrides).toEqual([
      { for: inDays(20), date: inDays(13) }
    ]);
  });

  it('replaces an earlier move of the same payday', async () => {
    const { token, id } = await withPayday();
    await gql(SET, { id, for: inDays(20), date: inDays(13) }, token);
    const body = await gql(SET, { id, for: inDays(20), date: inDays(15) }, token);
    expect(body.data.setPaydayOverride.payday.overrides).toEqual([
      { for: inDays(20), date: inDays(15) }
    ]);
  });

  it('puts the payday back when no date is given', async () => {
    const { token, id } = await withPayday();
    await gql(SET, { id, for: inDays(20), date: inDays(13) }, token);
    const body = await gql(SET, { id, for: inDays(20) }, token);
    expect(body.data.setPaydayOverride.payday.overrides).toEqual([]);
  });

  it('keeps a move for each of several paydays, soonest first', async () => {
    const { token, id } = await withPayday();
    await gql(SET, { id, for: inDays(50), date: inDays(45) }, token);
    const body = await gql(SET, { id, for: inDays(20), date: inDays(13) }, token);
    expect(body.data.setPaydayOverride.payday.overrides.map((o: { for: string }) => o.for)).toEqual([
      inDays(20),
      inDays(50)
    ]);
  });

  it('forgets moves for paydays that have passed', async () => {
    const { token, id } = await withPayday();
    await mongoose
      .model('Payday')
      .updateOne({ _id: id }, { overrides: [{ for: inDays(-10), date: inDays(-12) }] });
    const body = await gql(SET, { id, for: inDays(20), date: inDays(13) }, token);
    expect(body.data.setPaydayOverride.payday.overrides).toEqual([
      { for: inDays(20), date: inDays(13) }
    ]);
  });

  it('rejects dates that are not real', async () => {
    const { token, id } = await withPayday();
    expect(errorCode(await gql(SET, { id, for: '2030-02-30', date: '2030-02-10' }, token))).toBe(
      'PAYDAY_OVERRIDE_INVALID'
    );
    expect(errorCode(await gql(SET, { id, for: inDays(20), date: '17/12/2030' }, token))).toBe(
      'PAYDAY_OVERRIDE_INVALID'
    );
  });

  it('returns PAYDAY_NOT_FOUND for an unknown id', async () => {
    const { token } = await createUserWithAccount();
    const body = await gql(SET, { id: UNKNOWN, for: inDays(20), date: inDays(13) }, token);
    expect(errorCode(body)).toBe('PAYDAY_NOT_FOUND');
  });

  it('returns FORBIDDEN for another users payday', async () => {
    const { id } = await withPayday();
    const other = await createUserWithAccount();
    const body = await gql(SET, { id, for: inDays(20), date: inDays(13) }, other.token);
    expect(errorCode(body)).toBe('FORBIDDEN');
  });

  it('survives updating the payday rule', async () => {
    const { token, id } = await withPayday();
    await gql(SET, { id, for: inDays(20), date: inDays(13) }, token);
    const body = await gql(
      `mutation ($id: ID!, $input: PaydayInput!) {
        updatePayday(id: $id, input: $input) { payday { overrides { for date } } }
      }`,
      { id, input: { frequency: 'MONTHLY', type: 'LAST_DAY' } },
      token
    );
    expect(body.data.updatePayday.payday.overrides).toHaveLength(1);
  });
});

import mongoose from 'mongoose';
import {
  setupTestApp,
  teardownTestApp,
  clearDatabase,
  gql,
  errorCode,
  createUserWithAccount,
  type Credentials
} from '../helpers';

beforeAll(setupTestApp);
afterAll(teardownTestApp);
beforeEach(clearDatabase);

// Every test signs in as `other` and goes after `owner`'s user and account
let owner: Credentials & { accountId: string };
let other: Credentials & { accountId: string };

beforeEach(async () => {
  owner = await createUserWithAccount();
  other = await createUserWithAccount();
});

const asOther = (query: string, variables?: Record<string, unknown>) => gql(query, variables, other.token);

const count = (model: string, filter = {}) => mongoose.model(model).countDocuments(filter);

describe('accounts', () => {
  it("can't read another user's account", async () => {
    expect(errorCode(await asOther(`query ($id: ID) { account(id: $id) { id } }`, { id: owner.accountId }))).toBe(
      'FORBIDDEN'
    );
  });

  it('can read their own account with no id', async () => {
    const body = await asOther(`query { account { id } }`);
    expect(body.data.account.id).toBe(other.accountId);
  });

  it("can't make an account for another user", async () => {
    const lonely = await createUserWithAccount({ withAccount: false });
    const body = await asOther(
      `mutation ($input: CreateAccountInput!) { createAccount(input: $input) { success } }`,
      { input: { userId: lonely.user.id, bankBalance: 1, monthlyIncome: 1 } }
    );
    // There's no way to name a user: an account is always made for whoever is signed in
    expect(body.errors).toBeDefined();
    expect(await count('Account')).toBe(2);
  });

  it("can't update another user's account", async () => {
    const body = await asOther(
      `mutation ($id: ID!, $input: UpdateAccountInput!) { updateAccount(id: $id, input: $input) { success } }`,
      { id: owner.accountId, input: { bankBalance: 0 } }
    );
    expect(errorCode(body)).toBe('FORBIDDEN');
    const mine = await gql(`query { account { bankBalance } }`, undefined, owner.token);
    expect(mine.data.account.bankBalance).toBe(1000);
  });

  it("can't run payday or change payments on another user's account", async () => {
    const payday = await asOther(
      `mutation ($input: StartPaydayCycleInput!) { startPaydayCycle(input: $input) { success } }`,
      { input: { accountId: owner.accountId, payday: '2030-01-01', bankBalance: 0, recurringPaymentIds: [] } }
    );
    expect(errorCode(payday)).toBe('FORBIDDEN');
    const paid = await asOther(
      `mutation ($input: MarkPaymentsPaidInput!) { markPaymentsPaid(input: $input) { success } }`,
      { input: { accountId: owner.accountId, recurringPaymentIds: [], oneOffPaymentIds: [] } }
    );
    expect(errorCode(paid)).toBe('FORBIDDEN');
    const unpaid = await asOther(
      `mutation ($input: MarkPaymentsUnpaidInput!) { markPaymentsUnpaid(input: $input) { success } }`,
      { input: { accountId: owner.accountId, recurringPaymentIds: [] } }
    );
    expect(errorCode(unpaid)).toBe('FORBIDDEN');
    const skipped = await asOther(
      `mutation ($input: SkipRecurringPaymentsInput!) { skipRecurringPayments(input: $input) { success } }`,
      { input: { accountId: owner.accountId, recurringPaymentIds: [] } }
    );
    expect(errorCode(skipped)).toBe('FORBIDDEN');
  });
});

describe("records can't be added to another user's account", () => {
  it('notes', async () => {
    const body = await asOther(
      `mutation ($input: CreateNoteInput!) { createNote(input: $input) { success } }`,
      { input: { accountId: owner.accountId, body: 'planted' } }
    );
    expect(errorCode(body)).toBe('FORBIDDEN');
    expect(await count('Note', { account: owner.accountId })).toBe(0);
  });

  it('one-off payments', async () => {
    const body = await asOther(
      `mutation ($input: CreateOneOffPaymentInput!) { createOneOffPayment(input: $input) { success } }`,
      {
        input: {
          accountId: owner.accountId,
          name: 'Planted',
          amount: 10,
          dueDate: '2030-06-15',
          type: 'EXPENSE',
          category: 'FOOD'
        }
      }
    );
    expect(errorCode(body)).toBe('FORBIDDEN');
    expect(await count('OneOffPayment', { account: owner.accountId })).toBe(0);
  });

  it('recurring payments', async () => {
    const body = await asOther(
      `mutation ($input: CreateRecurringPaymentInput!) { createRecurringPayment(input: $input) { success } }`,
      {
        input: {
          accountId: owner.accountId,
          name: 'Planted',
          amount: 10,
          category: 'SUBSCRIPTION',
          frequency: 'MONTHLY',
          type: 'EXPENSE',
          firstPaymentDate: '2030-01-01'
        }
      }
    );
    expect(errorCode(body)).toBe('FORBIDDEN');
    expect(await count('RecurringPayment', { account: owner.accountId })).toBe(0);
  });
});

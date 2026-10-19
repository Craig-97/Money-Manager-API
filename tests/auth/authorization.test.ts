import mongoose from 'mongoose';
import {
  setupTestApp,
  teardownTestApp,
  clearDatabase,
  gql,
  errorCode,
  createUserWithBudget,
  type Credentials
} from '../helpers';

beforeAll(setupTestApp);
afterAll(teardownTestApp);
beforeEach(clearDatabase);

// Every test signs in as `other` and goes after `owner`'s user and budget
let owner: Credentials & { budgetId: string };
let other: Credentials & { budgetId: string };

beforeEach(async () => {
  owner = await createUserWithBudget();
  other = await createUserWithBudget();
});

const asOther = (query: string, variables?: Record<string, unknown>) => gql(query, variables, other.token);

const count = (model: string, filter = {}) => mongoose.model(model).countDocuments(filter);

describe('budgets', () => {
  it("can't read another user's budget", async () => {
    expect(errorCode(await asOther(`query ($id: ID) { budget(id: $id) { id } }`, { id: owner.budgetId }))).toBe(
      'FORBIDDEN'
    );
  });

  it('can read their own budget with no id', async () => {
    const body = await asOther(`query { budget { id } }`);
    expect(body.data.budget.id).toBe(other.budgetId);
  });

  it("can't make a budget for another user", async () => {
    const lonely = await createUserWithBudget({ withBudget: false });
    const body = await asOther(
      `mutation ($input: CreateBudgetInput!) { createBudget(input: $input) { success } }`,
      { input: { userId: lonely.user.id, bankBalance: 1, monthlyIncome: 1 } }
    );
    // There's no way to name a user: a budget is always made for whoever is signed in
    expect(body.errors).toBeDefined();
    expect(await count('Budget')).toBe(2);
  });

  it("can't update another user's budget", async () => {
    const body = await asOther(
      `mutation ($id: ID!, $input: UpdateBudgetInput!) { updateBudget(id: $id, input: $input) { success } }`,
      { id: owner.budgetId, input: { monthlyIncome: 0 } }
    );
    expect(errorCode(body)).toBe('FORBIDDEN');
    const mine = await gql(`query { budget { monthlyIncome } }`, undefined, owner.token);
    expect(mine.data.budget.monthlyIncome).toBe(2000);
  });

  it("can't run payday or change payments on another user's budget", async () => {
    const payday = await asOther(
      `mutation ($input: StartPaydayCycleInput!) { startPaydayCycle(input: $input) { success } }`,
      { input: { budgetId: owner.budgetId, payday: '2030-01-01', currentBalance: 0, leftOver: [] } }
    );
    expect(errorCode(payday)).toBe('FORBIDDEN');
    const paid = await asOther(
      `mutation ($input: MarkPaymentsPaidInput!) { markPaymentsPaid(input: $input) { success } }`,
      { input: { budgetId: owner.budgetId, recurringPaymentIds: [], oneOffPaymentIds: [] } }
    );
    expect(errorCode(paid)).toBe('FORBIDDEN');
    const unpaid = await asOther(
      `mutation ($input: MarkPaymentsUnpaidInput!) { markPaymentsUnpaid(input: $input) { success } }`,
      { input: { budgetId: owner.budgetId, recurringPaymentIds: [] } }
    );
    expect(errorCode(unpaid)).toBe('FORBIDDEN');
    const skipped = await asOther(
      `mutation ($input: SkipRecurringPaymentsInput!) { skipRecurringPayments(input: $input) { success } }`,
      { input: { budgetId: owner.budgetId, recurringPaymentIds: [] } }
    );
    expect(errorCode(skipped)).toBe('FORBIDDEN');
  });
});

describe("records can't be added to another user's budget", () => {
  it('notes', async () => {
    const body = await asOther(
      `mutation ($input: CreateNoteInput!) { createNote(input: $input) { success } }`,
      { input: { budgetId: owner.budgetId, body: 'planted' } }
    );
    expect(errorCode(body)).toBe('FORBIDDEN');
    expect(await count('Note', { budget: owner.budgetId })).toBe(0);
  });

  it('one-off payments', async () => {
    const body = await asOther(
      `mutation ($input: CreateOneOffPaymentInput!) { createOneOffPayment(input: $input) { success } }`,
      {
        input: {
          budgetId: owner.budgetId,
          name: 'Planted',
          amount: 10,
          dueDate: '2030-06-15',
          type: 'EXPENSE',
          category: 'FOOD'
        }
      }
    );
    expect(errorCode(body)).toBe('FORBIDDEN');
    expect(await count('OneOffPayment', { budget: owner.budgetId })).toBe(0);
  });

  it('recurring payments', async () => {
    const body = await asOther(
      `mutation ($input: CreateRecurringPaymentInput!) { createRecurringPayment(input: $input) { success } }`,
      {
        input: {
          budgetId: owner.budgetId,
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
    expect(await count('RecurringPayment', { budget: owner.budgetId })).toBe(0);
  });
});

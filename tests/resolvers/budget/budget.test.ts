import mongoose from 'mongoose';
import {
  setupTestApp,
  teardownTestApp,
  clearDatabase,
  gql,
  errorCode,
  createUserWithBudget
} from '../../helpers';

beforeAll(setupTestApp);
afterAll(teardownTestApp);
beforeEach(clearDatabase);

const CREATE = `mutation ($input: CreateBudgetInput!) {
  createBudget(input: $input) {
    success
    budget {
      id bankBalance monthlyIncome
      user { id }
      oneOffPayments { name amount type category }
      recurringPayments { name }
      payday { frequency type }
    }
  }
}`;

const FIND = `query ($id: ID) {
  budget(id: $id) {
    id bankBalance monthlyIncome
    user { id email }
    oneOffPayments { name amount }
    recurringPayments { name }
    notes { body }
    payday { frequency }
  }
}`;

const NOTE = `mutation ($input: CreateNoteInput!) { createNote(input: $input) { success } }`;

describe('createBudget', () => {
  it('creates a budget with nested one-off payments and payday', async () => {
    const { token, user } = await createUserWithBudget({ withBudget: false });
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
    const { success, budget } = body.data.createBudget;
    expect(success).toBe(true);
    expect(budget).toMatchObject({
      bankBalance: 1500.5,
      monthlyIncome: 3000,
      user: { id: user.id },
      oneOffPayments: [{ name: 'Holiday', amount: 400, type: 'EXPENSE', category: 'TRAVEL' }],
      payday: { frequency: 'MONTHLY', type: 'LAST_DAY' }
    });
  });

  it('creates a budget with several one-off and recurring payments in one transaction', async () => {
    const { token } = await createUserWithBudget({ withBudget: false });
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
    const { budget } = body.data.createBudget;
    expect(budget.oneOffPayments.map((p: { name: string }) => p.name).sort()).toEqual(['P1', 'P2', 'P3']);
    expect(budget.recurringPayments.map((p: { name: string }) => p.name).sort()).toEqual(['R1', 'R2', 'R3']);
  });

  it('creates a budget with nested recurring payments', async () => {
    const { token } = await createUserWithBudget({ withBudget: false });
    const recurring = (name: string, category: string, amount: number) => ({
      name,
      amount,
      category,
      frequency: 'MONTHLY',
      type: 'EXPENSE',
      firstPaymentDate: '2030-01-01'
    });
    const body = await gql(
      `mutation ($input: CreateBudgetInput!) {
        createBudget(input: $input) {
          budget { recurringPayments { name amount category frequency type } }
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
    const { recurringPayments } = body.data.createBudget.budget;
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

  it('links the budget to the user', async () => {
    const { token, user, budgetId } = await createUserWithBudget();
    const body = await gql(`query { tokenFindUser { budget } }`, undefined, token);
    expect(body.data.tokenFindUser.budget).toBe(budgetId);
    expect(user.id).toBeDefined();
  });

  it('rejects a second budget for the same user', async () => {
    const { token } = await createUserWithBudget();
    const body = await gql(CREATE, { input: { bankBalance: 1, monthlyIncome: 1 } }, token);
    expect(errorCode(body)).toBe('BUDGET_EXISTS');
  });

  it('only makes budgets for the signed-in user, so naming a user is a validation error', async () => {
    const { token } = await createUserWithBudget({ withBudget: false });
    const body = await gql(
      CREATE,
      { input: { userId: '507f1f77bcf86cd799439011', bankBalance: 1, monthlyIncome: 1 } },
      token
    );
    expect(body.errors).toBeDefined();
    expect(body.data).toBeUndefined();
    expect(await mongoose.model('Budget').countDocuments()).toBe(0);
  });

  it('requires authentication', async () => {
    const body = await gql(CREATE, { input: { bankBalance: 1, monthlyIncome: 1 } });
    expect(errorCode(body)).toBe('UNAUTHENTICATED');
  });
});

describe('budget queries', () => {
  it('finds a budget by its id with populated, amount-sorted children', async () => {
    const { token, user, budgetId } = await createUserWithBudget({
      budget: {
        oneOffPayments: [
          { name: 'Big', amount: 900, dueDate: '2030-01-01', type: 'EXPENSE', category: 'FOOD' },
          { name: 'Small', amount: 10, dueDate: '2030-01-01', type: 'EXPENSE', category: 'FOOD' }
        ]
      }
    });
    await gql(NOTE, { input: { budgetId, body: 'Remember' } }, token);
    const body = await gql(FIND, { id: budgetId }, token);
    expect(body.errors).toBeUndefined();
    const budget = body.data.budget;
    expect(budget.id).toBe(budgetId);
    expect(budget.user).toMatchObject({ id: user.id, email: user.email });
    expect(budget.oneOffPayments.map((p: { name: string }) => p.name)).toEqual(['Small', 'Big']);
    expect(budget.notes).toEqual([{ body: 'Remember' }]);
    expect(budget.payday).toBeNull();
  });

  it("finds the user's default budget when no id is given", async () => {
    const { token, budgetId } = await createUserWithBudget();
    const body = await gql(FIND, {}, token);
    expect(body.errors).toBeUndefined();
    expect(body.data.budget.id).toBe(budgetId);
  });

  it('ignores the id lists budgets used to store', async () => {
    const { token, budgetId } = await createUserWithBudget();
    await gql(NOTE, { input: { budgetId, body: 'Remember' } }, token);
    // Budgets saved before the switch to virtuals still carry these until they're cleaned up
    const stale = new mongoose.Types.ObjectId();
    await mongoose.connection.collection('budgets').updateOne(
      { _id: new mongoose.Types.ObjectId(budgetId) },
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
    const body = await gql(FIND, { id: budgetId }, token);
    expect(body.errors).toBeUndefined();
    expect(body.data.budget.notes).toEqual([{ body: 'Remember' }]);
    expect(body.data.budget.oneOffPayments).toEqual([]);
    expect(body.data.budget.payday).toBeNull();
  });

  it('returns BUDGET_NOT_LINKED for a user without a budget', async () => {
    const { token } = await createUserWithBudget({ withBudget: false });
    const body = await gql(FIND, {}, token);
    expect(errorCode(body)).toBe('BUDGET_NOT_LINKED');
  });

  it("refuses another user's budget id", async () => {
    const owner = await createUserWithBudget();
    const other = await createUserWithBudget();
    const body = await gql(FIND, { id: owner.budgetId }, other.token);
    expect(errorCode(body)).toBe('FORBIDDEN');
  });

  it("refuses a budget id that doesn't exist, the same as someone else's", async () => {
    const { token } = await createUserWithBudget();
    const body = await gql(FIND, { id: '507f1f77bcf86cd799439011' }, token);
    expect(errorCode(body)).toBe('FORBIDDEN');
  });

  it('refuses a malformed id', async () => {
    const { token } = await createUserWithBudget();
    const body = await gql(FIND, { id: 'not-an-id' }, token);
    expect(errorCode(body)).toBe('FORBIDDEN');
  });

  it("refuses the user's own user id, as it isn't a budget id", async () => {
    const { token, user } = await createUserWithBudget();
    const body = await gql(FIND, { id: user.id }, token);
    expect(errorCode(body)).toBe('FORBIDDEN');
  });

  it('requires authentication to fetch a budget', async () => {
    const body = await gql(FIND, { id: '507f1f77bcf86cd799439011' });
    expect(errorCode(body)).toBe('UNAUTHENTICATED');
  });
});

describe('updateBudget', () => {
  const UPDATE = `mutation ($id: ID!, $input: UpdateBudgetInput!) {
    updateBudget(id: $id, input: $input) { success budget { bankBalance monthlyIncome } }
  }`;

  it('updates the income, leaving the balance to the accounts', async () => {
    const { token, budgetId } = await createUserWithBudget();
    const body = await gql(UPDATE, { id: budgetId, input: { monthlyIncome: 42 } }, token);
    expect(body.errors).toBeUndefined();
    expect(body.data.updateBudget).toEqual({
      success: true,
      budget: { bankBalance: 1000, monthlyIncome: 42 }
    });
  });

  it('returns whatever is selected on the budget', async () => {
    const { token, budgetId } = await createUserWithBudget();
    await gql(NOTE, { input: { budgetId, body: 'Kept' } }, token);
    const body = await gql(
      `mutation ($id: ID!, $input: UpdateBudgetInput!) {
        updateBudget(id: $id, input: $input) { budget { monthlyIncome notes { body } } }
      }`,
      { id: budgetId, input: { monthlyIncome: 2500 } },
      token
    );
    expect(body.errors).toBeUndefined();
    expect(body.data.updateBudget.budget).toEqual({ monthlyIncome: 2500, notes: [{ body: 'Kept' }] });
  });

  it('rejects an update with no fields', async () => {
    const { token, budgetId } = await createUserWithBudget();
    const body = await gql(UPDATE, { id: budgetId, input: {} }, token);
    expect(errorCode(body)).toBe('NO_VALID_FIELDS_PROVIDED');
  });

  it('refuses a budget that is not the signed-in user\'s', async () => {
    const { token } = await createUserWithBudget();
    const body = await gql(
      UPDATE,
      { id: '507f1f77bcf86cd799439011', input: { monthlyIncome: 1 } },
      token
    );
    // Refused before looking it up, the same as someone else's budget
    expect(errorCode(body)).toBe('FORBIDDEN');
  });
});

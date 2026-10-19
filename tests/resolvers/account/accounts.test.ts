import mongoose from 'mongoose';
import { setupTestApp, teardownTestApp, clearDatabase, gql, errorCode, createUserWithBudget } from '../../helpers';
import { balancesToAccounts } from '../../../scripts/migrations/balancesToAccounts';

beforeAll(setupTestApp);
afterAll(teardownTestApp);
beforeEach(clearDatabase);

const ACCOUNT = 'id name kind balance counts interestRate purpose balanceUpdatedAt';
const BUDGET = `budget { bankBalance accounts { ${ACCOUNT} } }`;
const QUERY = `query { ${BUDGET} }`;
const CREATE = `mutation ($input: CreateAccountInput!) {
  createAccount(input: $input) { success account { ${ACCOUNT} } ${BUDGET} }
}`;
const UPDATE = `mutation ($id: ID!, $input: UpdateAccountInput!) {
  updateAccount(id: $id, input: $input) { account { ${ACCOUNT} } ${BUDGET} }
}`;
const DELETE = `mutation ($id: ID!) { deleteAccount(id: $id) { success ${BUDGET} } }`;
const BALANCES = `mutation ($input: UpdateAccountBalancesInput!) {
  updateAccountBalances(input: $input) { success ${BUDGET} }
}`;
const PAYMENT = 'id name paysInto history { kind balanceChange transfer { account amount } }';
const CREATE_PAYMENT = `mutation ($input: CreateRecurringPaymentInput!) {
  createRecurringPayment(input: $input) { recurringPayment { ${PAYMENT} } }
}`;
const UPDATE_PAYMENT = `mutation ($id: ID!, $input: UpdateRecurringPaymentInput!) {
  updateRecurringPayment(id: $id, input: $input) { recurringPayment { ${PAYMENT} } }
}`;
const PAID = `mutation ($input: MarkPaymentsPaidInput!) {
  markPaymentsPaid(input: $input) { ${BUDGET} }
}`;
const UNPAID = `mutation ($input: MarkPaymentsUnpaidInput!) {
  markPaymentsUnpaid(input: $input) { ${BUDGET} }
}`;
const START = `mutation ($input: StartPaydayCycleInput!) {
  startPaydayCycle(input: $input) { ${BUDGET} }
}`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const byName = (accounts: any[]): Record<string, any> =>
  Object.fromEntries(accounts.map(account => [account.name, account]));

const addSavings = async (token: string, budgetId: string, extra: Record<string, unknown> = {}) => {
  const body = await gql(CREATE, { input: { budgetId, name: 'Cash ISA', balance: 8650, ...extra } }, token);
  return body.data.createAccount.account;
};

// A £250 monthly expense, due in the future so it can be paid
const payment = (budgetId: string, extra: Record<string, unknown> = {}) => ({
  budgetId,
  name: 'Cash ISA top-up',
  amount: 250,
  category: 'SAVINGS',
  frequency: 'MONTHLY',
  type: 'EXPENSE',
  firstPaymentDate: '2030-01-25',
  ...extra
});

describe('accounts', () => {
  it('gives a new budget a current account holding its opening balance, which counts', async () => {
    const { token } = await createUserWithBudget();
    const body = await gql(QUERY, undefined, token);
    expect(body.errors).toBeUndefined();
    expect(body.data.budget.bankBalance).toBe(1000);
    expect(body.data.budget.accounts).toEqual([
      expect.objectContaining({ name: 'Current account', kind: 'CURRENT', balance: 1000, counts: true })
    ]);
  });

  it('adds savings kept out of free to spend, unless switched on', async () => {
    const { token, budgetId } = await createUserWithBudget();
    const body = await gql(CREATE, { input: { budgetId, name: '  Cash ISA ', balance: 8650, interestRate: 4.5, purpose: ' ' } }, token);
    expect(body.errors).toBeUndefined();
    expect(body.data.createAccount.account).toMatchObject({
      name: 'Cash ISA',
      kind: 'SAVINGS',
      counts: false,
      interestRate: 4.5,
      purpose: null
    });
    expect(body.data.createAccount.budget.bankBalance).toBe(1000);

    const easy = await gql(CREATE, { input: { budgetId, name: 'Easy access', balance: 4200, counts: true } }, token);
    expect(easy.data.createAccount.budget.bankBalance).toBe(5200);
    // The current account first, then savings, oldest first
    expect(easy.data.createAccount.budget.accounts.map((a: { name: string }) => a.name)).toEqual([
      'Current account',
      'Cash ISA',
      'Easy access'
    ]);
  });

  it('updates only what is given, and dates a balance that is set', async () => {
    const { token, budgetId } = await createUserWithBudget();
    const isa = await addSavings(token, budgetId);

    const body = await gql(UPDATE, { id: isa.id, input: { balance: 8900, counts: true, purpose: 'Rainy day' } }, token);
    expect(body.errors).toBeUndefined();
    expect(body.data.updateAccount.account).toMatchObject({ name: 'Cash ISA', balance: 8900, counts: true, purpose: 'Rainy day' });
    expect(Number(body.data.updateAccount.account.balanceUpdatedAt)).toBeGreaterThanOrEqual(Number(isa.balanceUpdatedAt));
    expect(body.data.updateAccount.budget.bankBalance).toBe(9900);
  });

  it("keeps the current account counting, and won't delete it", async () => {
    const { token } = await createUserWithBudget();
    const current = (await gql(QUERY, undefined, token)).data.budget.accounts[0];

    expect(errorCode(await gql(UPDATE, { id: current.id, input: { counts: false } }, token))).toBe('CURRENT_ACCOUNT_FIXED');
    expect(errorCode(await gql(DELETE, { id: current.id }, token))).toBe('CURRENT_ACCOUNT_FIXED');
  });

  it('deletes savings, and payments into it carry on as plain expenses', async () => {
    const { token, budgetId } = await createUserWithBudget();
    const isa = await addSavings(token, budgetId);
    const created = await gql(CREATE_PAYMENT, { input: payment(budgetId, { paysInto: isa.id }) }, token);
    const topUp = created.data.createRecurringPayment.recurringPayment;
    expect(topUp.paysInto).toBe(isa.id);

    const body = await gql(DELETE, { id: isa.id }, token);
    expect(body.data.deleteAccount.success).toBe(true);
    expect(body.data.deleteAccount.budget.accounts).toHaveLength(1);
    const stored = await mongoose.model('RecurringPayment').findById(topUp.id);
    expect(stored.paysInto).toBeNull();
  });

  it("refuses another user's accounts", async () => {
    const owner = await createUserWithBudget();
    const other = await createUserWithBudget();
    const isa = await addSavings(owner.token, owner.budgetId);

    expect(errorCode(await gql(UPDATE, { id: isa.id, input: { balance: 0 } }, other.token))).toBe('FORBIDDEN');
    expect(errorCode(await gql(DELETE, { id: isa.id }, other.token))).toBe('FORBIDDEN');
    expect(
      errorCode(
        await gql(BALANCES, { input: { budgetId: other.budgetId, balances: [{ accountId: isa.id, balance: 0 }] } }, other.token)
      )
    ).toBe('ACCOUNT_NOT_FOUND');
  });

  it('sets several balances at once, the bank balance following those that count', async () => {
    const { token, budgetId } = await createUserWithBudget();
    const easy = await addSavings(token, budgetId, { name: 'Easy access', balance: 4200, counts: true });
    const current = (await gql(QUERY, undefined, token)).data.budget.accounts[0];

    const body = await gql(
      BALANCES,
      { input: { budgetId, balances: [{ accountId: current.id, balance: 5800 }, { accountId: easy.id, balance: 4300 }] } },
      token
    );
    expect(body.errors).toBeUndefined();
    expect(body.data.updateAccountBalances.budget.bankBalance).toBe(10100);
  });
});

describe('paying into savings', () => {
  it('takes it off the current account and adds it to the savings, and undoing takes it back', async () => {
    const { token, budgetId } = await createUserWithBudget();
    const isa = await addSavings(token, budgetId);
    const created = await gql(CREATE_PAYMENT, { input: payment(budgetId, { paysInto: isa.id }) }, token);
    const topUp = created.data.createRecurringPayment.recurringPayment;

    const paid = await gql(PAID, { input: { budgetId, recurringPaymentIds: [topUp.id], oneOffPaymentIds: [] } }, token);
    expect(paid.errors).toBeUndefined();
    expect(byName(paid.data.markPaymentsPaid.budget.accounts)).toMatchObject({
      'Current account': { balance: 750 },
      'Cash ISA': { balance: 8900 }
    });
    const history = await gql(`query ($id: ID!) { recurringPayment(id: $id) { ${PAYMENT} } }`, { id: topUp.id }, token);
    expect(history.data.recurringPayment.history[0]).toEqual({
      kind: 'PAID',
      balanceChange: -250,
      transfer: { account: isa.id, amount: 250 }
    });

    const undone = await gql(UNPAID, { input: { budgetId, recurringPaymentIds: [topUp.id] } }, token);
    expect(byName(undone.data.markPaymentsUnpaid.budget.accounts)).toMatchObject({
      'Current account': { balance: 1000 },
      'Cash ISA': { balance: 8650 }
    });
  });

  it('only lets an expense that isn’t a debt pay into one of the budget’s own savings', async () => {
    const owner = await createUserWithBudget();
    const other = await createUserWithBudget();
    const theirs = await addSavings(other.token, other.budgetId);
    const isa = await addSavings(owner.token, owner.budgetId);
    const current = (await gql(QUERY, undefined, owner.token)).data.budget.accounts[0];
    const create = (extra: Record<string, unknown>) =>
      gql(CREATE_PAYMENT, { input: payment(owner.budgetId, extra) }, owner.token);

    expect(errorCode(await create({ paysInto: isa.id, type: 'INCOME' }))).toBe('PAYS_INTO_NOT_ALLOWED');
    expect(
      errorCode(await create({ paysInto: isa.id, category: 'LOAN', debt: { balance: 100, apr: 5 } }))
    ).toBe('PAYS_INTO_NOT_ALLOWED');
    expect(errorCode(await create({ paysInto: current.id }))).toBe('NOT_A_SAVINGS_ACCOUNT');
    expect(errorCode(await create({ paysInto: theirs.id }))).toBe('NOT_A_SAVINGS_ACCOUNT');
  });

  it('stops paying into savings once the payment becomes income', async () => {
    const { token, budgetId } = await createUserWithBudget();
    const isa = await addSavings(token, budgetId);
    const created = await gql(CREATE_PAYMENT, { input: payment(budgetId, { paysInto: isa.id }) }, token);
    const topUp = created.data.createRecurringPayment.recurringPayment;

    const body = await gql(UPDATE_PAYMENT, { id: topUp.id, input: { type: 'INCOME' } }, token);
    expect(body.errors).toBeUndefined();
    expect(body.data.updateRecurringPayment.recurringPayment.paysInto).toBeNull();
  });

  it('adds a left-over payment into savings at payday, before the balances the user checked', async () => {
    const { token, budgetId } = await createUserWithBudget();
    const isa = await addSavings(token, budgetId);
    const easy = await addSavings(token, budgetId, { name: 'Easy access', balance: 4200 });
    const created = await gql(
      CREATE_PAYMENT,
      { input: payment(budgetId, { paysInto: isa.id, firstPaymentDate: '2030-01-10' }) },
      token
    );
    const topUp = created.data.createRecurringPayment.recurringPayment;

    const body = await gql(
      START,
      {
        input: {
          budgetId,
          payday: '2030-02-01',
          currentBalance: 3200,
          accountBalances: [{ accountId: easy.id, balance: 4250 }],
          leftOver: [{ recurringPaymentId: topUp.id, outcome: 'PAID' }]
        }
      },
      token
    );
    expect(body.errors).toBeUndefined();
    expect(byName(body.data.startPaydayCycle.budget.accounts)).toMatchObject({
      // As confirmed, with nothing more taken off for the top-up
      'Current account': { balance: 3200 },
      'Cash ISA': { balance: 8900 },
      'Easy access': { balance: 4250 }
    });
  });
});

describe('balancesToAccounts', () => {
  const db = () => mongoose.connection.db as NonNullable<typeof mongoose.connection.db>;

  it('gives a budget saved before accounts a current account holding its balance', async () => {
    const { token, budgetId } = await createUserWithBudget();
    // As older versions stored it: the balance on the budget, and no accounts
    await db().collection('accounts').deleteMany({});
    await db().collection('budgets').updateOne({}, { $set: { bankBalance: 1234.5 } });

    expect(await balancesToAccounts({ apply: false })).toEqual({ budgets: 1, created: 1, cleared: 1 });
    expect(await db().collection('accounts').countDocuments()).toBe(0);

    await balancesToAccounts({ apply: true });
    const body = await gql(QUERY, undefined, token);
    expect(body.data.budget).toMatchObject({
      bankBalance: 1234.5,
      accounts: [{ kind: 'CURRENT', balance: 1234.5, counts: true }]
    });
    const stored = await db().collection('budgets').findOne({ _id: new mongoose.Types.ObjectId(budgetId) });
    expect(stored).not.toHaveProperty('bankBalance');

    // Run again, there's nothing left to do
    expect(await balancesToAccounts({ apply: true })).toEqual({ budgets: 1, created: 0, cleared: 0 });
  });
});

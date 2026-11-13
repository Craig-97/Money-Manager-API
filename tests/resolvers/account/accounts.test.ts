import mongoose from 'mongoose';
import {
  setupTestApp,
  teardownTestApp,
  clearDatabase,
  gql,
  errorCode,
  createUserWithBudget
} from '../../helpers';
import { balancesToAccounts } from '../../../scripts/migrations/balancesToAccounts';

beforeAll(setupTestApp);
afterAll(teardownTestApp);
beforeEach(clearDatabase);

const ACCOUNT =
  'id name kind balance counts paidInto interest { rate frequency day nextDate } purpose balanceUpdatedAt';
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
const PAYMENT =
  'id name account paysInto history { kind balanceChange transfer { account amount } }';
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
const ASSIGN = `mutation ($input: AssignPaymentAccountsInput!) {
  assignPaymentAccounts(input: $input) { success ${BUDGET} }
}`;
const CREATE_ONE_OFF = `mutation ($input: CreateOneOffPaymentInput!) {
  createOneOffPayment(input: $input) { oneOffPayment { id account } }
}`;
const OVERPAY = `mutation ($input: LogDebtOverpaymentInput!) {
  logDebtOverpayment(input: $input) { ${BUDGET} }
}`;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const byName = (accounts: any[]): Record<string, any> =>
  Object.fromEntries(accounts.map(account => [account.name, account]));

const addSavings = async (token: string, budgetId: string, extra: Record<string, unknown> = {}) => {
  const body = await gql(
    CREATE,
    { input: { budgetId, name: 'Cash ISA', balance: 8650, ...extra } },
    token
  );
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
  it('gives a new budget a spending account that pay lands in, holding its opening balance', async () => {
    const { token } = await createUserWithBudget();
    const body = await gql(QUERY, undefined, token);
    expect(body.errors).toBeUndefined();
    expect(body.data.budget.bankBalance).toBe(1000);
    expect(body.data.budget.accounts).toEqual([
      expect.objectContaining({
        name: 'Current account',
        kind: 'SPENDING',
        paidInto: true,
        balance: 1000,
        counts: true
      })
    ]);
  });

  it('adds savings kept out of free to spend, unless switched on', async () => {
    const { token, budgetId } = await createUserWithBudget();
    const body = await gql(
      CREATE,
      {
        input: {
          budgetId,
          name: '  Cash ISA ',
          balance: 8650,
          interest: { rate: 4.5 },
          purpose: ' '
        }
      },
      token
    );
    expect(body.errors).toBeUndefined();
    expect(body.data.createAccount.account).toMatchObject({
      name: 'Cash ISA',
      kind: 'SAVINGS',
      counts: false,
      interest: { rate: 4.5, frequency: null, day: null, nextDate: null },
      purpose: null
    });
    expect(body.data.createAccount.budget.bankBalance).toBe(1000);

    const easy = await gql(
      CREATE,
      { input: { budgetId, name: 'Easy access', balance: 4200, counts: true } },
      token
    );
    expect(easy.data.createAccount.budget.bankBalance).toBe(5200);
    // Where pay lands first, then savings, oldest first
    expect(easy.data.createAccount.budget.accounts.map((a: { name: string }) => a.name)).toEqual([
      'Current account',
      'Cash ISA',
      'Easy access'
    ]);
  });

  it('updates only what is given, and dates a balance that is set', async () => {
    const { token, budgetId } = await createUserWithBudget();
    const isa = await addSavings(token, budgetId);

    const body = await gql(
      UPDATE,
      { id: isa.id, input: { balance: 8900, counts: true, purpose: 'Rainy day' } },
      token
    );
    expect(body.errors).toBeUndefined();
    expect(body.data.updateAccount.account).toMatchObject({
      name: 'Cash ISA',
      balance: 8900,
      counts: true,
      purpose: 'Rainy day'
    });
    expect(Number(body.data.updateAccount.account.balanceUpdatedAt)).toBeGreaterThanOrEqual(
      Number(isa.balanceUpdatedAt)
    );
    expect(body.data.updateAccount.budget.bankBalance).toBe(9900);
  });

  it("keeps where pay lands counting, and won't delete it or make it savings", async () => {
    const { token } = await createUserWithBudget();
    const current = (await gql(QUERY, undefined, token)).data.budget.accounts[0];

    expect(errorCode(await gql(UPDATE, { id: current.id, input: { counts: false } }, token))).toBe(
      'PAID_INTO_ACCOUNT_FIXED'
    );
    expect(
      errorCode(await gql(UPDATE, { id: current.id, input: { kind: 'SAVINGS' } }, token))
    ).toBe('PAID_INTO_ACCOUNT_FIXED');
    expect(errorCode(await gql(DELETE, { id: current.id }, token))).toBe('PAID_INTO_ACCOUNT_FIXED');
  });

  it('deletes savings, and payments into it carry on as plain expenses', async () => {
    const { token, budgetId } = await createUserWithBudget();
    const isa = await addSavings(token, budgetId);
    const created = await gql(
      CREATE_PAYMENT,
      { input: payment(budgetId, { paysInto: isa.id }) },
      token
    );
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

    expect(errorCode(await gql(UPDATE, { id: isa.id, input: { balance: 0 } }, other.token))).toBe(
      'FORBIDDEN'
    );
    expect(errorCode(await gql(DELETE, { id: isa.id }, other.token))).toBe('FORBIDDEN');
    expect(
      errorCode(
        await gql(
          BALANCES,
          { input: { budgetId: other.budgetId, balances: [{ accountId: isa.id, balance: 0 }] } },
          other.token
        )
      )
    ).toBe('ACCOUNT_NOT_FOUND');
  });

  it('sets several balances at once, the bank balance following those that count', async () => {
    const { token, budgetId } = await createUserWithBudget();
    const easy = await addSavings(token, budgetId, {
      name: 'Easy access',
      balance: 4200,
      counts: true
    });
    const current = (await gql(QUERY, undefined, token)).data.budget.accounts[0];

    const body = await gql(
      BALANCES,
      {
        input: {
          budgetId,
          balances: [
            { accountId: current.id, balance: 5800 },
            { accountId: easy.id, balance: 4300 }
          ]
        }
      },
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
    const created = await gql(
      CREATE_PAYMENT,
      { input: payment(budgetId, { paysInto: isa.id }) },
      token
    );
    const topUp = created.data.createRecurringPayment.recurringPayment;

    const paid = await gql(
      PAID,
      { input: { budgetId, recurringPaymentIds: [topUp.id], oneOffPaymentIds: [] } },
      token
    );
    expect(paid.errors).toBeUndefined();
    expect(byName(paid.data.markPaymentsPaid.budget.accounts)).toMatchObject({
      'Current account': { balance: 750 },
      'Cash ISA': { balance: 8900 }
    });
    const history = await gql(
      `query ($id: ID!) { recurringPayment(id: $id) { ${PAYMENT} } }`,
      { id: topUp.id },
      token
    );
    expect(history.data.recurringPayment.history[0]).toEqual({
      kind: 'PAID',
      balanceChange: -250,
      transfer: { account: isa.id, amount: 250 }
    });

    const undone = await gql(
      UNPAID,
      { input: { budgetId, recurringPaymentIds: [topUp.id] } },
      token
    );
    expect(byName(undone.data.markPaymentsUnpaid.budget.accounts)).toMatchObject({
      'Current account': { balance: 1000 },
      'Cash ISA': { balance: 8650 }
    });
  });

  it('only lets an expense that isn’t a debt move money into another of the budget’s accounts', async () => {
    const owner = await createUserWithBudget();
    const other = await createUserWithBudget();
    const theirs = await addSavings(other.token, other.budgetId);
    const isa = await addSavings(owner.token, owner.budgetId);
    const current = (await gql(QUERY, undefined, owner.token)).data.budget.accounts[0];
    const create = (extra: Record<string, unknown>) =>
      gql(CREATE_PAYMENT, { input: payment(owner.budgetId, extra) }, owner.token);

    expect(errorCode(await create({ paysInto: isa.id, type: 'INCOME' }))).toBe(
      'PAYS_INTO_NOT_ALLOWED'
    );
    expect(
      errorCode(
        await create({ paysInto: isa.id, category: 'FINANCES', debt: { balance: 100, apr: 5 } })
      )
    ).toBe('PAYS_INTO_NOT_ALLOWED');
    // It goes out of the account pay lands in, so it can't go back into it
    expect(errorCode(await create({ paysInto: current.id }))).toBe('PAYS_INTO_SAME_ACCOUNT');
    expect(errorCode(await create({ paysInto: theirs.id }))).toBe('ACCOUNT_NOT_ALLOWED');
  });

  it('stops paying into savings once the payment becomes income', async () => {
    const { token, budgetId } = await createUserWithBudget();
    const isa = await addSavings(token, budgetId);
    const created = await gql(
      CREATE_PAYMENT,
      { input: payment(budgetId, { paysInto: isa.id }) },
      token
    );
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
          paidIntoBalance: 3200,
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

  it('gives a budget saved before accounts a spending account that pay lands in, holding its balance', async () => {
    const { token, budgetId } = await createUserWithBudget();
    // As older versions stored it: the balance on the budget, and no accounts
    await db().collection('accounts').deleteMany({});
    await db()
      .collection('budgets')
      .updateOne({}, { $set: { bankBalance: 1234.5 } });

    expect(await balancesToAccounts({ apply: false })).toEqual({
      budgets: 1,
      created: 1,
      cleared: 1,
      converted: 0
    });
    expect(await db().collection('accounts').countDocuments()).toBe(0);

    await balancesToAccounts({ apply: true });
    const body = await gql(QUERY, undefined, token);
    expect(body.data.budget).toMatchObject({
      bankBalance: 1234.5,
      accounts: [{ kind: 'SPENDING', paidInto: true, balance: 1234.5, counts: true }]
    });
    const stored = await db()
      .collection('budgets')
      .findOne({ _id: new mongoose.Types.ObjectId(budgetId) });
    expect(stored).not.toHaveProperty('bankBalance');

    // Run again, there's nothing left to do
    expect(await balancesToAccounts({ apply: true })).toEqual({
      budgets: 1,
      created: 0,
      cleared: 0,
      converted: 0
    });
  });

  it('makes a current account from before spending accounts the one pay lands in', async () => {
    const { token } = await createUserWithBudget();
    // As the first version of accounts stored it
    await db()
      .collection('accounts')
      .updateMany({}, { $set: { kind: 'CURRENT' }, $unset: { paidInto: '' } });

    expect(await balancesToAccounts({ apply: true })).toMatchObject({ created: 0, converted: 1 });
    const body = await gql(QUERY, undefined, token);
    expect(body.data.budget.accounts).toEqual([
      expect.objectContaining({ kind: 'SPENDING', paidInto: true, balance: 1000 })
    ]);
  });
});

describe('spending accounts', () => {
  const addSpending = (token: string, budgetId: string) =>
    addSavings(token, budgetId, { name: 'Joint bills', kind: 'SPENDING', balance: 2105 });
  const currentOf = async (token: string) =>
    (await gql(QUERY, undefined, token)).data.budget.accounts[0];

  it('adds one that counts, listed after where pay lands and before savings', async () => {
    const { token, budgetId } = await createUserWithBudget();
    await addSavings(token, budgetId);
    const joint = await addSpending(token, budgetId);
    expect(joint).toMatchObject({ kind: 'SPENDING', counts: true, paidInto: false });

    const body = await gql(QUERY, undefined, token);
    expect(body.data.budget.bankBalance).toBe(3105);
    expect(body.data.budget.accounts.map((a: { name: string }) => a.name)).toEqual([
      'Current account',
      'Joint bills',
      'Cash ISA'
    ]);
  });

  it('keeps one out of free to spend when asked, unless pay lands in it', async () => {
    const { token, budgetId } = await createUserWithBudget();
    const pot = await gql(
      CREATE,
      { input: { budgetId, name: 'Holiday pot', kind: 'SPENDING', balance: 300, counts: false } },
      token
    );
    expect(pot.data.createAccount.account).toMatchObject({ kind: 'SPENDING', counts: false });
    expect(pot.data.createAccount.budget.bankBalance).toBe(1000);

    const joint = await addSpending(token, budgetId);
    const out = await gql(UPDATE, { id: joint.id, input: { counts: false } }, token);
    expect(out.data.updateAccount.account.counts).toBe(false);
    expect(out.data.updateAccount.budget.bankBalance).toBe(1000);

    // Pay landing in it brings it back into free to spend, and it can't be kept out
    expect(
      errorCode(
        await gql(UPDATE, { id: joint.id, input: { paidInto: true, counts: false } }, token)
      )
    ).toBe('PAID_INTO_ACCOUNT_FIXED');
    const paid = await gql(UPDATE, { id: joint.id, input: { paidInto: true } }, token);
    expect(paid.data.updateAccount.account).toMatchObject({ paidInto: true, counts: true });
  });

  it('moves where pay lands, only ever to a spending account', async () => {
    const { token, budgetId } = await createUserWithBudget();
    const isa = await addSavings(token, budgetId);
    const joint = await addSpending(token, budgetId);

    const body = await gql(UPDATE, { id: joint.id, input: { paidInto: true } }, token);
    expect(body.errors).toBeUndefined();
    expect(byName(body.data.updateAccount.budget.accounts)).toMatchObject({
      'Current account': { paidInto: false },
      'Joint bills': { paidInto: true }
    });
    // Where pay lands is listed first
    expect(body.data.updateAccount.budget.accounts[0].name).toBe('Joint bills');
    expect(errorCode(await gql(UPDATE, { id: isa.id, input: { paidInto: true } }, token))).toBe(
      'PAID_INTO_NOT_SPENDING'
    );
  });

  it('adds one that pay lands in from then on, only ever a spending account that counts', async () => {
    const { token, budgetId } = await createUserWithBudget();
    const input = { budgetId, name: 'New current', kind: 'SPENDING', balance: 400, paidInto: true };

    expect(errorCode(await gql(CREATE, { input: { ...input, kind: 'SAVINGS' } }, token))).toBe(
      'PAID_INTO_NOT_SPENDING'
    );
    expect(errorCode(await gql(CREATE, { input: { ...input, counts: false } }, token))).toBe(
      'PAID_INTO_ACCOUNT_FIXED'
    );
    expect(errorCode(await gql(CREATE, { input: { ...input, paidInto: false } }, token))).toBe(
      'BAD_USER_INPUT'
    );

    const body = await gql(CREATE, { input }, token);
    expect(body.errors).toBeUndefined();
    expect(body.data.createAccount.account).toMatchObject({ paidInto: true, counts: true });
    expect(byName(body.data.createAccount.budget.accounts)).toMatchObject({
      'Current account': { paidInto: false },
      'New current': { paidInto: true }
    });
    expect(body.data.createAccount.budget.accounts[0].name).toBe('New current');
  });

  it('pays from the account a payment names, and undoes onto that account even once it has moved', async () => {
    const { token, budgetId } = await createUserWithBudget();
    const joint = await addSpending(token, budgetId);
    const created = await gql(
      CREATE_PAYMENT,
      { input: payment(budgetId, { name: 'Energy', category: 'BILLS', account: joint.id }) },
      token
    );
    const energy = created.data.createRecurringPayment.recurringPayment;
    expect(energy.account).toBe(joint.id);

    const paid = await gql(
      PAID,
      { input: { budgetId, recurringPaymentIds: [energy.id], oneOffPaymentIds: [] } },
      token
    );
    expect(byName(paid.data.markPaymentsPaid.budget.accounts)).toMatchObject({
      'Current account': { balance: 1000 },
      'Joint bills': { balance: 1855 }
    });

    // Moved back to where pay lands, then undone: the money goes back where it came from
    const moved = await gql(
      ASSIGN,
      { input: { budgetId, payments: [{ recurringPaymentId: energy.id, accountId: null }] } },
      token
    );
    expect(moved.errors).toBeUndefined();
    const undone = await gql(
      UNPAID,
      { input: { budgetId, recurringPaymentIds: [energy.id] } },
      token
    );
    expect(byName(undone.data.markPaymentsUnpaid.budget.accounts)).toMatchObject({
      'Current account': { balance: 1000 },
      'Joint bills': { balance: 2105 }
    });
  });

  it('lands income in any account, but takes expenses only out of spending accounts', async () => {
    const { token, budgetId } = await createUserWithBudget();
    const isa = await addSavings(token, budgetId);
    const income = await gql(
      CREATE_PAYMENT,
      {
        input: payment(budgetId, {
          name: 'Interest',
          type: 'INCOME',
          category: 'GENERAL',
          account: isa.id
        })
      },
      token
    );
    const interest = income.data.createRecurringPayment.recurringPayment;

    const paid = await gql(
      PAID,
      { input: { budgetId, recurringPaymentIds: [interest.id], oneOffPaymentIds: [] } },
      token
    );
    expect(byName(paid.data.markPaymentsPaid.budget.accounts)).toMatchObject({
      'Current account': { balance: 1000 },
      'Cash ISA': { balance: 8900 }
    });
    expect(
      errorCode(await gql(CREATE_PAYMENT, { input: payment(budgetId, { account: isa.id }) }, token))
    ).toBe('ACCOUNT_NOT_ALLOWED');
  });

  it('moves money between spending accounts', async () => {
    const { token, budgetId } = await createUserWithBudget();
    const joint = await addSpending(token, budgetId);
    const created = await gql(
      CREATE_PAYMENT,
      {
        input: payment(budgetId, {
          name: 'Joint bills top-up',
          category: 'BILLS',
          paysInto: joint.id
        })
      },
      token
    );
    const topUp = created.data.createRecurringPayment.recurringPayment;

    const paid = await gql(
      PAID,
      { input: { budgetId, recurringPaymentIds: [topUp.id], oneOffPaymentIds: [] } },
      token
    );
    expect(byName(paid.data.markPaymentsPaid.budget.accounts)).toMatchObject({
      'Current account': { balance: 750 },
      'Joint bills': { balance: 2355 }
    });
    // The free to spend total is the same: the money only moved
    expect(paid.data.markPaymentsPaid.budget.bankBalance).toBe(3105);
  });

  it('sets several payments’ accounts at once, checking each', async () => {
    const { token, budgetId } = await createUserWithBudget();
    const joint = await addSpending(token, budgetId);
    const isa = await addSavings(token, budgetId);
    const make = async (name: string, extra: Record<string, unknown> = {}) =>
      (
        await gql(
          CREATE_PAYMENT,
          { input: payment(budgetId, { name, category: 'BILLS', ...extra }) },
          token
        )
      ).data.createRecurringPayment.recurringPayment;
    const energy = await make('Energy');
    const water = await make('Water');
    const topUp = await make('Joint bills top-up', { paysInto: joint.id });

    const body = await gql(
      ASSIGN,
      {
        input: {
          budgetId,
          payments: [
            { recurringPaymentId: energy.id, accountId: joint.id },
            { recurringPaymentId: water.id, accountId: joint.id }
          ]
        }
      },
      token
    );
    expect(body.errors).toBeUndefined();
    const stored = await mongoose
      .model('RecurringPayment')
      .find({ _id: { $in: [energy.id, water.id] } });
    expect(stored.map(p => String(p.account))).toEqual([joint.id, joint.id]);

    const assign = (recurringPaymentId: string, accountId: string) =>
      gql(ASSIGN, { input: { budgetId, payments: [{ recurringPaymentId, accountId }] } }, token);
    expect(errorCode(await assign(energy.id, isa.id))).toBe('ACCOUNT_NOT_ALLOWED');
    expect(errorCode(await assign(topUp.id, joint.id))).toBe('PAYS_INTO_SAME_ACCOUNT');
  });

  it('sends expenses back to where pay lands when their account becomes savings or is deleted', async () => {
    const { token, budgetId } = await createUserWithBudget();
    const joint = await addSpending(token, budgetId);
    const created = await gql(
      CREATE_PAYMENT,
      { input: payment(budgetId, { name: 'Energy', category: 'BILLS', account: joint.id }) },
      token
    );
    const energy = created.data.createRecurringPayment.recurringPayment;

    const savings = await gql(UPDATE, { id: joint.id, input: { kind: 'SAVINGS' } }, token);
    expect(savings.data.updateAccount.account).toMatchObject({ kind: 'SAVINGS', counts: false });
    expect((await mongoose.model('RecurringPayment').findById(energy.id)).account).toBeNull();

    await gql(UPDATE, { id: joint.id, input: { kind: 'SPENDING' } }, token);
    await gql(
      ASSIGN,
      { input: { budgetId, payments: [{ recurringPaymentId: energy.id, accountId: joint.id }] } },
      token
    );
    await gql(DELETE, { id: joint.id }, token);
    expect((await mongoose.model('RecurringPayment').findById(energy.id)).account).toBeNull();
    expect((await currentOf(token)).name).toBe('Current account');
  });

  it('records every expense on where pay lands once there’s a second account to spend from', async () => {
    const { token, budgetId } = await createUserWithBudget();
    const make = async (name: string, extra: Record<string, unknown> = {}) =>
      (
        await gql(
          CREATE_PAYMENT,
          { input: payment(budgetId, { name, category: 'BILLS', ...extra }) },
          token
        )
      ).data.createRecurringPayment.recurringPayment;
    const energy = await make('Energy');
    const pay = await make('Pay', { type: 'INCOME', category: 'GENERAL' });
    // With one, none needs naming
    expect(energy.account).toBeNull();

    const current = await currentOf(token);
    await addSpending(token, budgetId);
    const accountOf = async (id: string) => {
      const stored = await mongoose.model('RecurringPayment').findById(id);
      return stored.account ? String(stored.account) : null;
    };
    expect(await accountOf(energy.id)).toBe(current.id);
    // Income lands where pay does without needing to say
    expect(await accountOf(pay.id)).toBeNull();

    // New ones, and ones put back to no account, are recorded there too
    const water = await make('Water');
    expect(water.account).toBe(current.id);
    const back = await gql(UPDATE_PAYMENT, { id: water.id, input: { account: null } }, token);
    expect(back.data.updateRecurringPayment.recurringPayment.account).toBe(current.id);
  });

  it('records them when savings become an account to spend from', async () => {
    const { token, budgetId } = await createUserWithBudget();
    const isa = await addSavings(token, budgetId);
    const created = await gql(
      CREATE_PAYMENT,
      { input: payment(budgetId, { name: 'Energy', category: 'BILLS' }) },
      token
    );
    const energy = created.data.createRecurringPayment.recurringPayment;

    await gql(UPDATE, { id: isa.id, input: { kind: 'SPENDING' } }, token);
    expect(String((await mongoose.model('RecurringPayment').findById(energy.id)).account)).toBe(
      (await currentOf(token)).id
    );
  });

  it('moves a deleted account’s payments to where pay lands, by name while two are left to spend from', async () => {
    const { token, budgetId } = await createUserWithBudget();
    const joint = await addSpending(token, budgetId);
    const pot = await addSavings(token, budgetId, {
      name: 'Bills pot',
      kind: 'SPENDING',
      balance: 50
    });
    const current = await currentOf(token);
    const make = async (name: string, account: string) =>
      (
        await gql(
          CREATE_PAYMENT,
          { input: payment(budgetId, { name, category: 'BILLS', account }) },
          token
        )
      ).data.createRecurringPayment.recurringPayment;
    const energy = await make('Energy', joint.id);
    const water = await make('Water', pot.id);
    const accountOf = async (id: string) => {
      const stored = await mongoose.model('RecurringPayment').findById(id);
      return stored.account ? String(stored.account) : null;
    };

    await gql(DELETE, { id: joint.id }, token);
    expect(await accountOf(energy.id)).toBe(current.id);

    // Down to one, they go back to not naming one
    await gql(DELETE, { id: pot.id }, token);
    expect(await accountOf(water.id)).toBeNull();
  });

  it('pays one-offs and overpayments from the account they name', async () => {
    const { token, budgetId } = await createUserWithBudget();
    const joint = await addSpending(token, budgetId);
    const oneOff = await gql(
      CREATE_ONE_OFF,
      {
        input: {
          budgetId,
          name: 'Hotel deposit',
          amount: 220,
          dueDate: '2030-01-23',
          type: 'EXPENSE',
          category: 'HOLIDAYS',
          account: joint.id
        }
      },
      token
    );
    const hotel = oneOff.data.createOneOffPayment.oneOffPayment;
    expect(hotel.account).toBe(joint.id);
    const paid = await gql(
      PAID,
      { input: { budgetId, recurringPaymentIds: [], oneOffPaymentIds: [hotel.id] } },
      token
    );
    expect(byName(paid.data.markPaymentsPaid.budget.accounts)['Joint bills'].balance).toBe(1885);
    const undone = await gql(
      UNPAID,
      { input: { budgetId, recurringPaymentIds: [], oneOffPaymentIds: [hotel.id] } },
      token
    );
    expect(byName(undone.data.markPaymentsUnpaid.budget.accounts)['Joint bills'].balance).toBe(
      2105
    );

    const loan = await gql(
      CREATE_PAYMENT,
      {
        input: payment(budgetId, {
          name: 'Car finance',
          category: 'FINANCES',
          account: joint.id,
          debt: { balance: 5000, apr: 7 }
        })
      },
      token
    );
    const car = loan.data.createRecurringPayment.recurringPayment;
    const over = await gql(
      OVERPAY,
      { input: { budgetId, recurringPaymentId: car.id, amount: 100 } },
      token
    );
    expect(over.errors).toBeUndefined();
    expect(byName(over.data.logDebtOverpayment.budget.accounts)).toMatchObject({
      'Current account': { balance: 1000 },
      'Joint bills': { balance: 2005 }
    });
  });
});

describe('setting up accounts with the budget', () => {
  const CREATE_BUDGET = `mutation ($input: CreateBudgetInput!) {
    createBudget(input: $input) { budget { id ${BUDGET.replace('budget {', '').slice(0, -1)} recurringPayments { name account paysInto } } }
  }`;
  const setUp = async (input: Record<string, unknown>) => {
    const { token } = await createUserWithBudget({ withBudget: false });
    return gql(
      CREATE_BUDGET,
      { input: { bankBalance: 7895, monthlyIncome: 3600, ...input } },
      token
    );
  };
  const topUp = (extra: Record<string, unknown>) => ({
    name: 'Joint bills top-up',
    amount: 600,
    category: 'BILLS',
    frequency: 'MONTHLY',
    type: 'EXPENSE',
    firstPaymentDate: '2030-01-30',
    ...extra
  });

  it('makes the accounts, and payments that name them by key', async () => {
    const body = await setUp({
      paidIntoName: 'Everyday',
      accounts: [
        { key: 'joint', name: 'Joint bills', kind: 'SPENDING', balance: 2105 },
        { key: 'isa', name: 'Cash ISA', balance: 8650, interest: { rate: 4.5 } }
      ],
      recurringPayments: [
        topUp({ paysInto: 'joint' }),
        topUp({ name: 'Energy', amount: 120, account: 'joint' })
      ]
    });
    expect(body.errors).toBeUndefined();
    const budget = body.data.createBudget.budget;
    expect(budget.bankBalance).toBe(10000);
    const accounts = byName(budget.accounts);
    expect(accounts).toMatchObject({
      Everyday: { kind: 'SPENDING', paidInto: true, balance: 7895 },
      'Joint bills': { kind: 'SPENDING', counts: true },
      'Cash ISA': { kind: 'SAVINGS', counts: false, interest: { rate: 4.5 } }
    });
    expect(byName(budget.recurringPayments)).toMatchObject({
      // With two to spend from, it says it goes out of where pay lands
      'Joint bills top-up': { account: accounts.Everyday.id, paysInto: accounts['Joint bills'].id },
      Energy: { account: accounts['Joint bills'].id, paysInto: null }
    });
  });

  it('refuses a key that isn’t one of its accounts, or money moving into where it comes from', async () => {
    expect(errorCode(await setUp({ recurringPayments: [topUp({ paysInto: 'nope' })] }))).toBe(
      'ACCOUNT_NOT_ALLOWED'
    );
    expect(errorCode(await setUp({ recurringPayments: [topUp({ paysInto: 'paid-into' })] }))).toBe(
      'PAYS_INTO_SAME_ACCOUNT'
    );
  });
});

describe('savings interest', () => {
  const CATCH_UP = `mutation ($budgetId: ID!) {
    catchUpInterest(budgetId: $budgetId) {
      success
      budget { bankBalance accounts { id name balance balanceUpdatedAt interest { frequency nextDate accrued added { date amount balanceAfter } } } }
    }
  }`;
  const catchUp = async (token: string, budgetId: string) => {
    const body = await gql(CATCH_UP, { budgetId }, token);
    expect(body.errors).toBeUndefined();
    return byName(body.data.catchUpInterest.budget.accounts)['Cash ISA'];
  };
  const day = (days: number) => new Date(`${fromToday(days)}T00:00:00Z`);
  // As if the app hadn't been opened for a while: the next payment was due some days ago, and
  // interest was counted up to a day before that
  const dueSince = (id: string, { due, countedFrom }: { due: number; countedFrom: number }) =>
    mongoose.model('Account').updateOne(
      { _id: id },
      {
        $set: {
          'interest.nextDate': day(-due),
          'interest.accrued': 0,
          'interest.accruedTo': day(-countedFrom)
        }
      }
    );
  // A monthly payment's share of the AER, spread over the year's days
  const dailyAt = (balance: number, rate: number) =>
    (balance * 12 * ((1 + rate / 100) ** (1 / 12) - 1)) / 365;
  const iso = (ms: string) => new Date(Number(ms)).toISOString().slice(0, 10);
  // A date some days from today, as the API takes it
  const fromToday = (days: number) =>
    new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);

  const BUILT_UP = `query { budget { accounts { name balance interest { rate accrued accruedTo } } } }`;
  const isaOf = async (token: string) =>
    byName((await gql(BUILT_UP, undefined, token)).data.budget.accounts)['Cash ISA'];
  // As if interest had been counted up to some days ago
  const countedFrom = (id: string, days: number) =>
    mongoose
      .model('Account')
      .updateOne(
        { _id: id },
        {
          $set: {
            'interest.accrued': 0,
            'interest.accruedTo': new Date(`${fromToday(-days)}T00:00:00Z`)
          }
        }
      );
  const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' });

  it('counts what’s built up at the old balance before a new one, and carries it on', async () => {
    const { token, budgetId } = await createUserWithBudget();
    // 3.65% AER on £100,000 is close to £9.83 a day
    const isa = await addSavings(token, budgetId, {
      balance: 100000,
      interest: { rate: 3.65, frequency: 'MONTHLY', day: 3 }
    });
    expect(iso((await isaOf(token)).interest.accruedTo)).toBe(today());
    await countedFrom(isa.id, 10);

    await gql(UPDATE, { id: isa.id, input: { balance: 50000 } }, token);

    const after = await isaOf(token);
    expect(after.interest.accrued).toBeCloseTo(dailyAt(100000, 3.65) * 10, 6);
    expect(iso(after.interest.accruedTo)).toBe(today());
  });

  it('keeps what’s built up when the rate or day changes', async () => {
    const { token, budgetId } = await createUserWithBudget();
    const isa = await addSavings(token, budgetId, {
      interest: { rate: 4.5, frequency: 'MONTHLY', day: 3 }
    });
    await countedFrom(isa.id, 5);

    await gql(
      UPDATE,
      { id: isa.id, input: { interest: { rate: 5, frequency: 'MONTHLY', day: 20 } } },
      token
    );

    const after = await isaOf(token);
    expect(after.interest.rate).toBe(5);
    expect(after.interest.accrued).toBeCloseTo(dailyAt(8650, 4.5) * 5, 6);
  });

  it('works out a monthly payment’s next date from its day', async () => {
    const { token, budgetId } = await createUserWithBudget();
    const isa = await addSavings(token, budgetId, {
      interest: { rate: 4.5, frequency: 'MONTHLY', day: 3 }
    });

    expect(isa.interest).toMatchObject({ rate: 4.5, frequency: 'MONTHLY', day: 3 });
    const next = new Date(Number(isa.interest.nextDate));
    expect(next.getUTCDate()).toBe(3);
    expect(next.getTime()).toBeGreaterThan(Date.now() - 86_400_000);
  });

  it('needs a day for monthly, and a date after today for the others', async () => {
    const { token, budgetId } = await createUserWithBudget();
    const noDay = await gql(
      CREATE,
      { input: { budgetId, name: 'ISA', balance: 1, interest: { rate: 4, frequency: 'MONTHLY' } } },
      token
    );
    expect(noDay.errors?.[0].message).toMatch('Choose the day of the month');
    const noDate = await gql(
      CREATE,
      {
        input: { budgetId, name: 'Bond', balance: 1, interest: { rate: 4, frequency: 'MATURITY' } }
      },
      token
    );
    expect(noDate.errors?.[0].message).toMatch('Choose when it’s next paid');
    const past = await gql(
      CREATE,
      {
        input: {
          budgetId,
          name: 'Bond',
          balance: 1,
          interest: { rate: 4, frequency: 'YEARLY', nextDate: fromToday(-1) }
        }
      },
      token
    );
    expect(errorCode(past)).toBe('INTEREST_DATE_PASSED');
  });

  it('adds a payment that’s come on its own date, without dating the balance, keeping it to check', async () => {
    const { token, budgetId } = await createUserWithBudget();
    const isa = await addSavings(token, budgetId, {
      interest: { rate: 4.5, frequency: 'MONTHLY', day: 3 }
    });
    await dueSince(isa.id, { due: 10, countedFrom: 40 });

    const after = await catchUp(token, budgetId);

    const amount = Math.round(dailyAt(8650, 4.5) * 30 * 100) / 100;
    expect(after.balance).toBe(8650 + amount);
    expect(after.balanceUpdatedAt).toBe(isa.balanceUpdatedAt);
    expect(after.interest.added).toEqual([
      { date: String(day(-10).getTime()), amount, balanceAfter: 8650 + amount }
    ]);
    expect(Number(after.interest.nextDate)).toBeGreaterThan(Date.now() - 86_400_000);
    // Again, there's nothing more to add
    expect((await catchUp(token, budgetId)).balance).toBe(8650 + amount);
  });

  it('adds each missed payment in order, the later ones earning on the earlier', async () => {
    const { token, budgetId } = await createUserWithBudget();
    const isa = await addSavings(token, budgetId, {
      interest: { rate: 4.5, frequency: 'MONTHLY', day: 3 }
    });
    const nextDate = new Date(Number(isa.interest.nextDate));
    const monthsBack = (months: number) => {
      const date = new Date(nextDate);
      date.setUTCMonth(date.getUTCMonth() - months);
      return date;
    };
    await mongoose
      .model('Account')
      .updateOne(
        { _id: isa.id },
        {
          $set: {
            'interest.nextDate': monthsBack(3),
            'interest.accrued': 0,
            'interest.accruedTo': monthsBack(4)
          }
        }
      );

    const after = await catchUp(token, budgetId);

    expect(after.interest.added.map((added: { date: string }) => Number(added.date))).toEqual([
      monthsBack(3).getTime(),
      monthsBack(2).getTime(),
      monthsBack(1).getTime()
    ]);
    const [first, , last] = after.interest.added;
    expect(last.balanceAfter).toBe(after.balance);
    expect(first.balanceAfter).toBe(8650 + first.amount);
    expect(Number(after.interest.nextDate)).toBe(nextDate.getTime());
  });

  it('adds it once when two tabs open at the same time', async () => {
    const { token, budgetId } = await createUserWithBudget();
    const isa = await addSavings(token, budgetId, {
      interest: { rate: 4.5, frequency: 'MONTHLY', day: 3 }
    });
    await dueSince(isa.id, { due: 10, countedFrom: 40 });

    await Promise.all([gql(CATCH_UP, { budgetId }, token), gql(CATCH_UP, { budgetId }, token)]);

    const stored = await mongoose.model('Account').findById(isa.id);
    expect(stored.interest.added).toHaveLength(1);
    expect(stored.balance).toBe(stored.interest.added[0].balanceAfter);
  });

  it('adds a fixed term’s interest when it matures, then stops', async () => {
    const { token, budgetId } = await createUserWithBudget();
    const bond = await addSavings(token, budgetId, {
      interest: { rate: 5, frequency: 'MATURITY', nextDate: fromToday(30) }
    });
    await dueSince(bond.id, { due: 1, countedFrom: 366 });

    const after = await catchUp(token, budgetId);

    expect(after.interest).toMatchObject({ frequency: 'MATURITY', nextDate: null });
    expect(after.interest.added).toHaveLength(1);
    // A year at 5%
    expect(after.balance).toBe(9082.5);
  });

  it('stops asking to check what was added once the balance is typed in', async () => {
    const { token, budgetId } = await createUserWithBudget();
    const isa = await addSavings(token, budgetId, {
      interest: { rate: 4.5, frequency: 'MONTHLY', day: 3 }
    });
    await dueSince(isa.id, { due: 10, countedFrom: 40 });
    await catchUp(token, budgetId);

    await gql(UPDATE, { id: isa.id, input: { balance: 8682 } }, token);

    expect((await catchUp(token, budgetId)).interest.added).toEqual([]);
  });

  it('stops for an account that becomes one to spend from', async () => {
    const { token, budgetId } = await createUserWithBudget();
    const isa = await addSavings(token, budgetId, { interest: { rate: 4.5 } });

    const body = await gql(UPDATE, { id: isa.id, input: { kind: 'SPENDING' } }, token);
    expect(body.data.updateAccount.account.interest).toBeNull();
  });
});

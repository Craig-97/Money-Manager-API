import mongoose from 'mongoose';
import {
  setupTestApp,
  teardownTestApp,
  clearDatabase,
  gql,
  errorCode,
  createUserWithBudget
} from '../../helpers';
import { migrateAccountHistory } from '../../../scripts/migrations/accountHistory';

beforeAll(setupTestApp);
afterAll(teardownTestApp);
beforeEach(clearDatabase);

const CHANGE = 'kind change balanceAfter name date';
const ACCOUNTS = `budget { accounts { id name balance history { ${CHANGE} } historyYears } }`;
const QUERY = `query { ${ACCOUNTS} }`;
const CREATE = `mutation ($input: CreateAccountInput!) {
  createAccount(input: $input) { account { id } }
}`;
const UPDATE = `mutation ($id: ID!, $input: UpdateAccountInput!) {
  updateAccount(id: $id, input: $input) { account { id } }
}`;
const DELETE = `mutation ($id: ID!) { deleteAccount(id: $id) { success } }`;
const CREATE_PAYMENT = `mutation ($input: CreateRecurringPaymentInput!) {
  createRecurringPayment(input: $input) { recurringPayment { id } }
}`;
const PAID = `mutation ($input: MarkPaymentsPaidInput!) { markPaymentsPaid(input: $input) { success } }`;
const UNPAID = `mutation ($input: MarkPaymentsUnpaidInput!) {
  markPaymentsUnpaid(input: $input) { success }
}`;

interface Change {
  kind: string;
  change: number;
  balanceAfter: number;
  name: string | null;
  date: string;
}
interface AccountWithHistory {
  id: string;
  name: string;
  balance: number;
  history: Change[];
  historyYears: number[];
}

const accounts = async (token: string): Promise<Record<string, AccountWithHistory>> => {
  const body = await gql(QUERY, undefined, token);
  expect(body.errors).toBeUndefined();
  return Object.fromEntries(
    body.data.budget.accounts.map((account: AccountWithHistory) => [account.name, account])
  );
};
const summary = (history: Change[]) =>
  history.map(({ kind, change, balanceAfter, name }) => ({ kind, change, balanceAfter, name }));

const addSavings = async (token: string, budgetId: string, balance = 4000) =>
  (await gql(CREATE, { input: { budgetId, name: 'Easy access', balance } }, token)).data
    .createAccount.account.id as string;

// A monthly expense due in the future, so it can be paid
const addPayment = async (token: string, budgetId: string, extra: Record<string, unknown> = {}) =>
  (
    await gql(
      CREATE_PAYMENT,
      {
        input: {
          budgetId,
          name: 'Netflix',
          amount: 20,
          category: 'SUBSCRIPTIONS',
          frequency: 'MONTHLY',
          type: 'EXPENSE',
          firstPaymentDate: '2030-01-02',
          ...extra
        }
      },
      token
    )
  ).data.createRecurringPayment.recurringPayment.id as string;

const pay = (token: string, budgetId: string, ids: string[]) =>
  gql(PAID, { input: { budgetId, recurringPaymentIds: ids, oneOffPaymentIds: [] } }, token);

describe('account history', () => {
  it('starts with the balance each account was added with', async () => {
    const { token, budgetId } = await createUserWithBudget();
    await addSavings(token, budgetId);

    const { 'Current account': current, 'Easy access': savings } = await accounts(token);
    expect(summary(current.history)).toEqual([
      { kind: 'OPENING', change: 1000, balanceAfter: 1000, name: null }
    ]);
    expect(summary(savings.history)).toEqual([
      { kind: 'OPENING', change: 4000, balanceAfter: 4000, name: null }
    ]);
  });

  it('notes a balance typed in and how far it moved, but not the same figure again', async () => {
    const { token, budgetId } = await createUserWithBudget();
    const id = await addSavings(token, budgetId);

    await gql(UPDATE, { id, input: { balance: 4190 } }, token);
    await gql(UPDATE, { id, input: { balance: 4190 } }, token);

    expect(summary((await accounts(token))['Easy access'].history)).toEqual([
      { kind: 'BALANCE_SET', change: 190, balanceAfter: 4190, name: null },
      { kind: 'OPENING', change: 4000, balanceAfter: 4000, name: null }
    ]);
  });

  it('lists payments out, and money moved between accounts, with the balance after each', async () => {
    const { token, budgetId } = await createUserWithBudget();
    const savings = await addSavings(token, budgetId);
    const netflix = await addPayment(token, budgetId);
    const topUp = await addPayment(token, budgetId, {
      name: 'Savings top-up',
      amount: 500,
      category: 'SAVINGS',
      paysInto: savings
    });

    await pay(token, budgetId, [netflix]);
    await pay(token, budgetId, [topUp]);

    const { 'Current account': current, 'Easy access': easy } = await accounts(token);
    expect(summary(current.history)).toEqual([
      { kind: 'MOVE_OUT', change: -500, balanceAfter: 480, name: 'Easy access' },
      { kind: 'PAYMENT', change: -20, balanceAfter: 980, name: 'Netflix' },
      { kind: 'OPENING', change: 1000, balanceAfter: 1000, name: null }
    ]);
    expect(summary(easy.history)).toEqual([
      { kind: 'MOVE_IN', change: 500, balanceAfter: 4500, name: 'Current account' },
      { kind: 'OPENING', change: 4000, balanceAfter: 4000, name: null }
    ]);
  });

  it('works the balances out again from a typed-in one, and drops a payment that’s undone', async () => {
    const { token, budgetId } = await createUserWithBudget();
    const netflix = await addPayment(token, budgetId);
    const gym = await addPayment(token, budgetId, { name: 'Gym', amount: 34 });
    const { 'Current account': before } = await accounts(token);

    await pay(token, budgetId, [netflix]);
    await gql(UPDATE, { id: before.id, input: { balance: 900 } }, token);
    await pay(token, budgetId, [gym]);
    await gql(
      UNPAID,
      { input: { budgetId, recurringPaymentIds: [gym], oneOffPaymentIds: [] } },
      token
    );

    expect(summary((await accounts(token))['Current account'].history)).toEqual([
      { kind: 'BALANCE_SET', change: -80, balanceAfter: 900, name: null },
      { kind: 'PAYMENT', change: -20, balanceAfter: 980, name: 'Netflix' },
      { kind: 'OPENING', change: 1000, balanceAfter: 1000, name: null }
    ]);
  });

  it('leaves out payment records from before its history started', async () => {
    const { token, budgetId } = await createUserWithBudget();
    const netflix = await addPayment(token, budgetId);
    await pay(token, budgetId, [netflix]);
    // As if the account came from before account history, then the migration started it today
    await mongoose.model('AccountRecord').deleteMany({});
    await new Promise(resolve => setTimeout(resolve, 5));
    expect(await migrateAccountHistory({ apply: true })).toEqual({ found: 1, changed: 1 });

    expect(summary((await accounts(token))['Current account'].history)).toEqual([
      { kind: 'OPENING', change: 980, balanceAfter: 980, name: null }
    ]);
    // Running it again finds nothing to do
    expect(await migrateAccountHistory({ apply: true })).toEqual({ found: 0, changed: 0 });
  });

  it('lists interest the app added on its own date', async () => {
    const { token, budgetId } = await createUserWithBudget();
    const id = await addSavings(token, budgetId);
    await gql(
      UPDATE,
      { id, input: { interest: { rate: 4.1, frequency: 'MONTHLY', day: 1 } } },
      token
    );
    // As if the 1st had come and gone with interest built up
    const due = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));
    await mongoose
      .model('Account')
      .updateOne(
        { _id: id },
        { $set: { 'interest.nextDate': due, 'interest.accrued': 14.12, 'interest.accruedTo': due } }
      );

    await gql(
      `mutation ($budgetId: ID!) { catchUpInterest(budgetId: $budgetId) { success } }`,
      {
        budgetId
      },
      token
    );

    const [interest] = (await accounts(token))['Easy access'].history;
    expect(interest).toMatchObject({ kind: 'INTEREST', change: 14.12, balanceAfter: 4014.12 });
    expect(new Date(Number(interest.date)).getTime()).toBe(due.getTime());
  });

  it('pages by year, and says which years it has', async () => {
    const { token, budgetId } = await createUserWithBudget();
    const { 'Current account': current } = await accounts(token);
    // An older change, from last year
    const year = new Date().getUTCFullYear();
    await mongoose.model('AccountRecord').create({
      budget: budgetId,
      account: current.id,
      kind: 'BALANCE_SET',
      date: new Date(Date.UTC(year - 1, 5, 1)),
      change: 0,
      balanceAfter: 1000,
      createdAt: new Date(Date.UTC(year - 1, 5, 1))
    });

    const body = await gql(
      `query ($year: Int) { budget { accounts { history(year: $year) { kind } historyYears } } }`,
      { year: year - 1 },
      token
    );
    const [account] = body.data.budget.accounts;
    expect(account.historyYears).toEqual([year, year - 1]);
    expect(account.history).toEqual([{ kind: 'BALANCE_SET' }]);
  });

  it("reads one account's history on its own, but not another user's", async () => {
    const { token, budgetId } = await createUserWithBudget();
    const id = await addSavings(token, budgetId);
    const query = `query ($id: ID!) { account(id: $id) { name history { kind } historyYears } }`;

    const body = await gql(query, { id }, token);
    expect(body.errors).toBeUndefined();
    expect(body.data.account).toEqual({
      name: 'Easy access',
      history: [{ kind: 'OPENING' }],
      historyYears: [new Date().getUTCFullYear()]
    });
    const other = await createUserWithBudget();
    expect(errorCode(await gql(query, { id }, other.token))).toBe('FORBIDDEN');
  });

  it('goes with the account when it’s deleted', async () => {
    const { token, budgetId } = await createUserWithBudget();
    const id = await addSavings(token, budgetId);

    await gql(DELETE, { id }, token);

    expect(await mongoose.model('AccountRecord').countDocuments({ account: id })).toBe(0);
  });
});

import { setupTestApp, teardownTestApp, clearDatabase, gql, errorCode, createUserWithAccount } from '../helpers';
import { nextOccurrence, ukDay } from '../../utils/dates';

beforeAll(setupTestApp);
afterAll(teardownTestApp);
beforeEach(clearDatabase);

const FIELDS = 'id name nextDueDate status';
const CREATE = `mutation ($input: CreateRecurringPaymentInput!) {
  createRecurringPayment(input: $input) { recurringPayment { ${FIELDS} } }
}`;
const UPDATE = `mutation ($id: ID!, $input: UpdateRecurringPaymentInput!) {
  updateRecurringPayment(id: $id, input: $input) { recurringPayment { ${FIELDS} } }
}`;
const START = `mutation ($input: StartPaydayCycleInput!) {
  startPaydayCycle(input: $input) {
    success
    account { bankBalance cycleStartedOn recurringPayments { ${FIELDS} } }
  }
}`;

// Dates come back through GraphQL String as epoch milliseconds
const apiDate = (iso: string) => String(new Date(iso).getTime());

const createPayment = async (token: string, accountId: string, name: string, firstPaymentDate: string) => {
  const body = await gql(
    CREATE,
    {
      input: {
        accountId,
        name,
        amount: 20,
        category: 'SUBSCRIPTION',
        frequency: 'MONTHLY',
        type: 'EXPENSE',
        firstPaymentDate
      }
    },
    token
  );
  return body.data.createRecurringPayment.recurringPayment;
};

describe('recurring payment due dates', () => {
  it('is due on its first payment date when that is still to come, unpaid', async () => {
    const { token, accountId } = await createUserWithAccount();
    const payment = await createPayment(token, accountId, 'Netflix', '2030-01-31');

    expect(payment).toMatchObject({ nextDueDate: apiDate('2030-01-31'), status: 'UNPAID' });
  });

  it('is due on its next date from today when the first payment has passed', async () => {
    const { token, accountId } = await createUserWithAccount();
    const payment = await createPayment(token, accountId, 'Gym', '2020-01-15');

    const expected = nextOccurrence(
      { firstPaymentDate: new Date('2020-01-15'), frequency: 'MONTHLY' },
      ukDay()
    );
    expect(payment.nextDueDate).toBe(String(expected?.getTime()));
  });

  it('is due from the account setup too', async () => {
    const { token } = await createUserWithAccount({
      account: {
        recurringPayments: [
          {
            name: 'Rent',
            amount: 500,
            category: 'RENT',
            frequency: 'MONTHLY',
            type: 'EXPENSE',
            firstPaymentDate: '2030-02-01'
          }
        ]
      }
    });
    const body = await gql(
      `query { tokenFindUser { id } }`,
      undefined,
      token
    );
    const account = await gql(
      `query ($id: ID) { account(id: $id) { recurringPayments { ${FIELDS} } } }`,
      { id: body.data.tokenFindUser.id },
      token
    );
    expect(account.data.account.recurringPayments[0]).toMatchObject({
      nextDueDate: apiDate('2030-02-01'),
      status: 'UNPAID'
    });
  });

  it('can be marked paid or skipped without moving its date', async () => {
    const { token, accountId } = await createUserWithAccount();
    const { id } = await createPayment(token, accountId, 'Netflix', '2030-01-31');

    const paid = await gql(UPDATE, { id, input: { status: 'PAID' } }, token);
    expect(paid.data.updateRecurringPayment.recurringPayment).toMatchObject({
      nextDueDate: apiDate('2030-01-31'),
      status: 'PAID'
    });

    const skipped = await gql(UPDATE, { id, input: { status: 'SKIPPED' } }, token);
    expect(skipped.data.updateRecurringPayment.recurringPayment.status).toBe('SKIPPED');
  });

  it('starts unpaid on its new date when the schedule changes', async () => {
    const { token, accountId } = await createUserWithAccount();
    const { id } = await createPayment(token, accountId, 'Netflix', '2030-01-31');
    await gql(UPDATE, { id, input: { status: 'PAID' } }, token);

    const body = await gql(UPDATE, { id, input: { firstPaymentDate: '2030-03-05' } }, token);

    expect(body.data.updateRecurringPayment.recurringPayment).toMatchObject({
      nextDueDate: apiDate('2030-03-05'),
      status: 'UNPAID'
    });
  });
});

describe('a new account', () => {
  it('counts setup as the start of its first cycle', async () => {
    const { token, user } = await createUserWithAccount();
    const body = await gql(`query ($id: ID) { account(id: $id) { cycleStartedOn } }`, { id: user.id }, token);
    expect(body.data.account.cycleStartedOn).toBe(String(ukDay().getTime()));
  });
});

describe('startPaydayCycle', () => {
  it('sets the balance and moves the chosen payments on to their next date as unpaid', async () => {
    const { token, accountId } = await createUserWithAccount();
    const netflix = await createPayment(token, accountId, 'Netflix', '2030-01-31');
    const gym = await createPayment(token, accountId, 'Gym', '2030-01-10');
    await gql(UPDATE, { id: netflix.id, input: { status: 'PAID' } }, token);
    await gql(UPDATE, { id: gym.id, input: { status: 'PAID' } }, token);

    const body = await gql(
      START,
      {
        input: {
          accountId,
          payday: '2030-01-31',
          bankBalance: 2500.5,
          recurringPaymentIds: [netflix.id]
        }
      },
      token
    );

    expect(body.errors).toBeUndefined();
    const { account } = body.data.startPaydayCycle;
    expect(account.bankBalance).toBe(2500.5);
    expect(account.cycleStartedOn).toBe(apiDate('2030-01-31'));
    const byName = Object.fromEntries(
      account.recurringPayments.map((p: { name: string }) => [p.name, p])
    );
    // 31 Jan moves to the end of February
    expect(byName.Netflix).toMatchObject({ nextDueDate: apiDate('2030-02-28'), status: 'UNPAID' });
    // Not chosen, so left as it was
    expect(byName.Gym).toMatchObject({ nextDueDate: apiDate('2030-01-10'), status: 'PAID' });
  });

  it("refuses another user's account", async () => {
    const owner = await createUserWithAccount();
    const other = await createUserWithAccount();

    const body = await gql(
      START,
      {
        input: {
          accountId: owner.accountId,
          payday: '2030-01-31',
          bankBalance: 0,
          recurringPaymentIds: []
        }
      },
      other.token
    );

    expect(errorCode(body)).toBe('FORBIDDEN');
  });

  it("refuses payments that aren't on the account", async () => {
    const owner = await createUserWithAccount();
    const other = await createUserWithAccount();
    const theirs = await createPayment(other.token, other.accountId, 'Theirs', '2030-01-31');

    const body = await gql(
      START,
      {
        input: {
          accountId: owner.accountId,
          payday: '2030-01-31',
          bankBalance: 0,
          recurringPaymentIds: [theirs.id]
        }
      },
      owner.token
    );

    expect(errorCode(body)).toBe('RECURRING_PAYMENT_NOT_FOUND');
  });
});

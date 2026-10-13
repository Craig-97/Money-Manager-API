import {
  setupTestApp,
  teardownTestApp,
  clearDatabase,
  gql,
  errorCode,
  createUserWithAccount,
  GqlBody,
  Variables
} from '../../helpers';

beforeAll(setupTestApp);
afterAll(teardownTestApp);
beforeEach(clearDatabase);

const DEBT = 'debt { balance startingBalance apr balanceUpdatedAt }';
const FIELDS = `id name amount type ${DEBT}`;
const CREATE = `mutation ($input: CreateRecurringPaymentInput!) {
  createRecurringPayment(input: $input) { recurringPayment { ${FIELDS} } }
}`;
const UPDATE = `mutation ($id: ID!, $input: UpdateRecurringPaymentInput!) {
  updateRecurringPayment(id: $id, input: $input) { recurringPayment { ${FIELDS} } }
}`;
const ACCOUNT = `account { bankBalance recurringPayments { ${FIELDS} } }`;
const PAID = `mutation ($input: MarkPaymentsPaidInput!) { markPaymentsPaid(input: $input) { ${ACCOUNT} } }`;
const UNPAID = `mutation ($input: MarkPaymentsUnpaidInput!) { markPaymentsUnpaid(input: $input) { ${ACCOUNT} } }`;
const OVERPAY = `mutation ($input: LogDebtOverpaymentInput!) {
  logDebtOverpayment(input: $input) { success ${ACCOUNT} }
}`;
const CREATE_ACCOUNT_DEBT = `mutation ($input: CreateAccountInput!) {
  createAccount(input: $input) { account { recurringPayments { ${FIELDS} } } }
}`;

// A £100 monthly payment, due in the future so it can be paid, unless the fields say otherwise
const makePayment = (token: string, accountId: string, extra: Variables = {}) =>
  gql(
    CREATE,
    {
      input: {
        accountId,
        name: 'Credit card',
        amount: 100,
        category: 'CREDIT_CARD',
        frequency: 'MONTHLY',
        type: 'EXPENSE',
        firstPaymentDate: '2030-01-31',
        ...extra
      }
    },
    token
  );

const created = (body: GqlBody) => body.data.createRecurringPayment.recurringPayment;
const fieldOf = (body: GqlBody) => body.errors?.[0]?.extensions?.field;

const markPaid = (token: string, accountId: string, id: string) =>
  gql(PAID, { input: { accountId, recurringPaymentIds: [id], oneOffPaymentIds: [] } }, token);
const markUnpaid = (token: string, accountId: string, id: string) =>
  gql(UNPAID, { input: { accountId, recurringPaymentIds: [id] } }, token);
const overpay = (token: string, accountId: string, recurringPaymentId: string, amount: number) =>
  gql(OVERPAY, { input: { accountId, recurringPaymentId, amount } }, token);

const accountOf = (body: GqlBody, mutation: string) => body.data[mutation].account;

// A credit card owing £1,200 at 12% a year: £12 interest a month
const card = { balance: 1200, apr: 12 };

describe('tracking a payment as a debt', () => {
  it('stores the debt and dates its balance', async () => {
    const { token, accountId } = await createUserWithAccount();
    const body = await makePayment(token, accountId, { debt: { ...card, startingBalance: 3500 } });

    expect(body.errors).toBeUndefined();
    const { debt } = created(body);
    expect(debt).toMatchObject({ balance: 1200, apr: 12, startingBalance: 3500 });
    expect(Number(debt.balanceUpdatedAt)).toBeGreaterThan(Date.now() - 60_000);
  });

  it('leaves the starting balance empty when it is not given', async () => {
    const { token, accountId } = await createUserWithAccount();
    const body = await makePayment(token, accountId, { debt: card });
    expect(created(body).debt.startingBalance).toBeNull();
  });

  it('is not a debt unless asked', async () => {
    const { token, accountId } = await createUserWithAccount();
    const body = await makePayment(token, accountId);
    expect(created(body).debt).toBeNull();
  });

  it("won't track income as a debt", async () => {
    const { token, accountId } = await createUserWithAccount();
    const body = await makePayment(token, accountId, { type: 'INCOME', debt: card });
    expect(errorCode(body)).toBe('BAD_USER_INPUT');
    expect(fieldOf(body)).toBe('debt');
  });

  it.each([
    [{ balance: -1, apr: 12 }, 'debt.balance'],
    [{ balance: 100, apr: -1 }, 'debt.apr'],
    [{ balance: 100, apr: 101 }, 'debt.apr'],
    [{ balance: 100, apr: 12, startingBalance: -5 }, 'debt.startingBalance']
  ])('rejects a debt of %o', async (debt, field) => {
    const { token, accountId } = await createUserWithAccount();
    const body = await makePayment(token, accountId, { debt });
    expect(errorCode(body)).toBe('BAD_USER_INPUT');
    expect(fieldOf(body)).toBe(field);
  });

  it('can be set up alongside the account', async () => {
    const { token } = await createUserWithAccount({ withAccount: false });
    const body = await gql(
      CREATE_ACCOUNT_DEBT,
      {
        input: {
          bankBalance: 1000,
          monthlyIncome: 2000,
          recurringPayments: [
            {
              name: 'Car finance',
              amount: 245,
              category: 'LOAN',
              frequency: 'MONTHLY',
              type: 'EXPENSE',
              firstPaymentDate: '2030-01-26',
              debt: { balance: 6860, apr: 6.9 }
            }
          ]
        }
      },
      token
    );

    expect(body.errors).toBeUndefined();
    const [payment] = body.data.createAccount.account.recurringPayments;
    expect(payment.debt).toMatchObject({ balance: 6860, apr: 6.9 });
    expect(payment.debt.balanceUpdatedAt).not.toBeNull();
  });
});

describe('updating a debt', () => {
  const update = (token: string, id: string, input: Variables) => gql(UPDATE, { id, input }, token);
  const updated = (body: GqlBody) => body.data.updateRecurringPayment.recurringPayment;
  const later = () => new Promise(resolve => setTimeout(resolve, 15));

  it('dates a new balance, from a statement say', async () => {
    const { token, accountId } = await createUserWithAccount();
    const payment = created(await makePayment(token, accountId, { debt: card }));
    await later();

    const body = await update(token, payment.id, { debt: { ...card, balance: 1150 } });

    expect(updated(body).debt.balance).toBe(1150);
    expect(Number(updated(body).debt.balanceUpdatedAt)).toBeGreaterThan(Number(payment.debt.balanceUpdatedAt));
  });

  it('keeps the date when only the rate changes', async () => {
    const { token, accountId } = await createUserWithAccount();
    const payment = created(await makePayment(token, accountId, { debt: card }));
    await later();

    const body = await update(token, payment.id, { debt: { ...card, apr: 19.9 } });

    expect(updated(body).debt).toMatchObject({ apr: 19.9, balanceUpdatedAt: payment.debt.balanceUpdatedAt });
  });

  it('starts tracking an existing payment', async () => {
    const { token, accountId } = await createUserWithAccount();
    const payment = created(await makePayment(token, accountId));

    const body = await update(token, payment.id, { debt: card });

    expect(updated(body).debt).toMatchObject(card);
  });

  it('stops tracking with null, keeping the payment', async () => {
    const { token, accountId } = await createUserWithAccount();
    const payment = created(await makePayment(token, accountId, { debt: card }));

    const body = await update(token, payment.id, { debt: null });

    expect(body.errors).toBeUndefined();
    expect(updated(body)).toMatchObject({ name: 'Credit card', debt: null });
  });

  it("won't turn a debt into income", async () => {
    const { token, accountId } = await createUserWithAccount();
    const payment = created(await makePayment(token, accountId, { debt: card }));

    const body = await update(token, payment.id, { type: 'INCOME' });

    expect(errorCode(body)).toBe('BAD_USER_INPUT');
    expect(fieldOf(body)).toBe('debt');
  });
});

describe('paying a debt', () => {
  it('adds the month’s interest, then takes the payment off', async () => {
    const { token, accountId } = await createUserWithAccount();
    const payment = created(await makePayment(token, accountId, { debt: card }));

    const account = accountOf(await markPaid(token, accountId, payment.id), 'markPaymentsPaid');

    // £1,200 + £12 interest − £100
    expect(account.recurringPayments[0].debt.balance).toBe(1112);
    expect(account.bankBalance).toBe(900);
  });

  it('works out interest for the payment’s own frequency', async () => {
    const { token, accountId } = await createUserWithAccount();
    const payment = created(
      await makePayment(token, accountId, { amount: 50, frequency: 'WEEKLY', debt: { balance: 5200, apr: 10 } })
    );

    const account = accountOf(await markPaid(token, accountId, payment.id), 'markPaymentsPaid');

    // £5,200 × 10% ÷ 52 weeks = £10 interest
    expect(account.recurringPayments[0].debt.balance).toBe(5160);
  });

  it('owes more when the payment is less than the interest', async () => {
    const { token, accountId } = await createUserWithAccount();
    const payment = created(await makePayment(token, accountId, { amount: 5, debt: card }));

    const account = accountOf(await markPaid(token, accountId, payment.id), 'markPaymentsPaid');

    expect(account.recurringPayments[0].debt.balance).toBe(1207);
  });

  it('never goes below nothing left to pay', async () => {
    const { token, accountId } = await createUserWithAccount();
    const payment = created(await makePayment(token, accountId, { debt: { balance: 60, apr: 0 } }));

    const account = accountOf(await markPaid(token, accountId, payment.id), 'markPaymentsPaid');

    expect(account.recurringPayments[0].debt.balance).toBe(0);
    expect(account.bankBalance).toBe(900);
  });

  it('puts the debt and bank balance back exactly when undone', async () => {
    const { token, accountId } = await createUserWithAccount();
    const payment = created(await makePayment(token, accountId, { debt: { balance: 60, apr: 0 } }));
    await markPaid(token, accountId, payment.id);

    const account = accountOf(await markUnpaid(token, accountId, payment.id), 'markPaymentsUnpaid');

    expect(account.recurringPayments[0].debt.balance).toBe(60);
    expect(account.bankBalance).toBe(1000);
  });
});

describe('undoing a payment', () => {
  it('gives back what was paid, even after the amount changes', async () => {
    const { token, accountId } = await createUserWithAccount();
    const payment = created(await makePayment(token, accountId, { amount: 20 }));
    await markPaid(token, accountId, payment.id);
    await gql(UPDATE, { id: payment.id, input: { amount: 30 } }, token);

    const account = accountOf(await markUnpaid(token, accountId, payment.id), 'markPaymentsUnpaid');

    expect(account.bankBalance).toBe(1000);
  });
});

describe('logDebtOverpayment', () => {
  it('takes it off the debt and off the bank balance', async () => {
    const { token, accountId } = await createUserWithAccount();
    const payment = created(await makePayment(token, accountId, { debt: card }));

    const body = await overpay(token, accountId, payment.id, 200);

    expect(body.data.logDebtOverpayment.success).toBe(true);
    const account = accountOf(body, 'logDebtOverpayment');
    expect(account.recurringPayments[0].debt.balance).toBe(1000);
    expect(account.bankBalance).toBe(800);
  });

  it('can clear what is left', async () => {
    const { token, accountId } = await createUserWithAccount();
    const payment = created(await makePayment(token, accountId, { debt: card }));

    const account = accountOf(await overpay(token, accountId, payment.id, 1200), 'logDebtOverpayment');

    expect(account.recurringPayments[0].debt.balance).toBe(0);
  });

  it("won't take more than is left to pay", async () => {
    const { token, accountId } = await createUserWithAccount();
    const payment = created(await makePayment(token, accountId, { debt: card }));

    const body = await overpay(token, accountId, payment.id, 1200.01);

    expect(errorCode(body)).toBe('BAD_USER_INPUT');
    expect(fieldOf(body)).toBe('amount');
  });

  it.each([0, -10])('needs an amount above £0, not %d', async amount => {
    const { token, accountId } = await createUserWithAccount();
    const payment = created(await makePayment(token, accountId, { debt: card }));

    const body = await overpay(token, accountId, payment.id, amount);

    expect(errorCode(body)).toBe('BAD_USER_INPUT');
    expect(fieldOf(body)).toBe('amount');
  });

  it('only works on a payment tracked as a debt', async () => {
    const { token, accountId } = await createUserWithAccount();
    const payment = created(await makePayment(token, accountId));

    const body = await overpay(token, accountId, payment.id, 50);

    expect(errorCode(body)).toBe('DEBT_NOT_TRACKED');
  });

  it("can't be used on someone else's debt", async () => {
    const owner = await createUserWithAccount();
    const payment = created(await makePayment(owner.token, owner.accountId, { debt: card }));
    const other = await createUserWithAccount();

    const sameAccount = await overpay(other.token, owner.accountId, payment.id, 50);
    const ownAccount = await overpay(other.token, other.accountId, payment.id, 50);

    expect(errorCode(sameAccount)).toBe('FORBIDDEN');
    expect(errorCode(ownAccount)).toBe('RECURRING_PAYMENT_NOT_FOUND');
  });
});

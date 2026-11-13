import mongoose from 'mongoose';
import {
  setupTestApp,
  teardownTestApp,
  clearDatabase,
  gql,
  errorCode,
  createUserWithBudget,
  GqlBody,
  Variables,
  debtInterestFrom
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
const BUDGET = `budget { bankBalance recurringPayments { ${FIELDS} } }`;
const PAID = `mutation ($input: MarkPaymentsPaidInput!) { markPaymentsPaid(input: $input) { ${BUDGET} } }`;
const UNPAID = `mutation ($input: MarkPaymentsUnpaidInput!) { markPaymentsUnpaid(input: $input) { ${BUDGET} } }`;
const OVERPAY = `mutation ($input: LogDebtOverpaymentInput!) {
  logDebtOverpayment(input: $input) { success ${BUDGET} }
}`;
const CREATE_BUDGET_DEBT = `mutation ($input: CreateBudgetInput!) {
  createBudget(input: $input) { budget { recurringPayments { ${FIELDS} } } }
}`;

// A £100 monthly payment, due in the future so it can be paid, unless the fields say otherwise
const makePayment = (token: string, budgetId: string, extra: Variables = {}) =>
  gql(
    CREATE,
    {
      input: {
        budgetId,
        name: 'Credit card',
        amount: 100,
        category: 'FINANCES',
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

const markPaid = (token: string, budgetId: string, id: string) =>
  gql(PAID, { input: { budgetId, recurringPaymentIds: [id], oneOffPaymentIds: [] } }, token);
const markUnpaid = (token: string, budgetId: string, id: string) =>
  gql(UNPAID, { input: { budgetId, recurringPaymentIds: [id] } }, token);
const overpay = (token: string, budgetId: string, recurringPaymentId: string, amount: number) =>
  gql(OVERPAY, { input: { budgetId, recurringPaymentId, amount } }, token);

const budgetOf = (body: GqlBody, mutation: string) => body.data[mutation].budget;

// A credit card owing £1,200 at 12% a year
const card = { balance: 1200, apr: 12 };
// Its £12 of interest built up by the payment on 31 Jan
const monthBuiltUp = (id: string) => debtInterestFrom(id, { day: '2030-01-31', accrued: 12 });

describe('tracking a payment as a debt', () => {
  it('stores the debt and dates its balance', async () => {
    const { token, budgetId } = await createUserWithBudget();
    const body = await makePayment(token, budgetId, { debt: { ...card, startingBalance: 3500 } });

    expect(body.errors).toBeUndefined();
    const { debt } = created(body);
    expect(debt).toMatchObject({ balance: 1200, apr: 12, startingBalance: 3500 });
    expect(Number(debt.balanceUpdatedAt)).toBeGreaterThan(Date.now() - 60_000);
  });

  it('leaves the starting balance empty when it is not given', async () => {
    const { token, budgetId } = await createUserWithBudget();
    const body = await makePayment(token, budgetId, { debt: card });
    expect(created(body).debt.startingBalance).toBeNull();
  });

  it('is not a debt unless asked', async () => {
    const { token, budgetId } = await createUserWithBudget();
    const body = await makePayment(token, budgetId);
    expect(created(body).debt).toBeNull();
  });

  it("won't track income as a debt", async () => {
    const { token, budgetId } = await createUserWithBudget();
    const body = await makePayment(token, budgetId, { type: 'INCOME', debt: card });
    expect(errorCode(body)).toBe('BAD_USER_INPUT');
    expect(fieldOf(body)).toBe('debt');
  });

  it.each([
    [{ balance: -1, apr: 12 }, 'debt.balance'],
    [{ balance: 100, apr: -1 }, 'debt.apr'],
    [{ balance: 100, apr: 101 }, 'debt.apr'],
    [{ balance: 100, apr: 12, startingBalance: -5 }, 'debt.startingBalance']
  ])('rejects a debt of %o', async (debt, field) => {
    const { token, budgetId } = await createUserWithBudget();
    const body = await makePayment(token, budgetId, { debt });
    expect(errorCode(body)).toBe('BAD_USER_INPUT');
    expect(fieldOf(body)).toBe(field);
  });

  it('can be set up alongside the budget', async () => {
    const { token } = await createUserWithBudget({ withBudget: false });
    const body = await gql(
      CREATE_BUDGET_DEBT,
      {
        input: {
          bankBalance: 1000,
          monthlyIncome: 2000,
          recurringPayments: [
            {
              name: 'Car finance',
              amount: 245,
              category: 'FINANCES',
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
    const [payment] = body.data.createBudget.budget.recurringPayments;
    expect(payment.debt).toMatchObject({ balance: 6860, apr: 6.9 });
    expect(payment.debt.balanceUpdatedAt).not.toBeNull();
  });
});

describe('updating a debt', () => {
  const update = (token: string, id: string, input: Variables) => gql(UPDATE, { id, input }, token);
  const updated = (body: GqlBody) => body.data.updateRecurringPayment.recurringPayment;
  const later = () => new Promise(resolve => setTimeout(resolve, 15));

  it('dates a new balance, from a statement say', async () => {
    const { token, budgetId } = await createUserWithBudget();
    const payment = created(await makePayment(token, budgetId, { debt: card }));
    await later();

    const body = await update(token, payment.id, { debt: { ...card, balance: 1150 } });

    expect(updated(body).debt.balance).toBe(1150);
    expect(Number(updated(body).debt.balanceUpdatedAt)).toBeGreaterThan(Number(payment.debt.balanceUpdatedAt));
  });

  it('keeps the date when only the rate changes', async () => {
    const { token, budgetId } = await createUserWithBudget();
    const payment = created(await makePayment(token, budgetId, { debt: card }));
    await later();

    const body = await update(token, payment.id, { debt: { ...card, apr: 19.9 } });

    expect(updated(body).debt).toMatchObject({ apr: 19.9, balanceUpdatedAt: payment.debt.balanceUpdatedAt });
  });

  it('starts tracking an existing payment', async () => {
    const { token, budgetId } = await createUserWithBudget();
    const payment = created(await makePayment(token, budgetId));

    const body = await update(token, payment.id, { debt: card });

    expect(updated(body).debt).toMatchObject(card);
  });

  it('stops tracking with null, keeping the payment', async () => {
    const { token, budgetId } = await createUserWithBudget();
    const payment = created(await makePayment(token, budgetId, { debt: card }));

    const body = await update(token, payment.id, { debt: null });

    expect(body.errors).toBeUndefined();
    expect(updated(body)).toMatchObject({ name: 'Credit card', debt: null });
  });

  it("won't turn a debt into income", async () => {
    const { token, budgetId } = await createUserWithBudget();
    const payment = created(await makePayment(token, budgetId, { debt: card }));

    const body = await update(token, payment.id, { type: 'INCOME' });

    expect(errorCode(body)).toBe('BAD_USER_INPUT');
    expect(fieldOf(body)).toBe('debt');
  });
});

describe('paying a debt', () => {
  it('adds the interest worked out each day up to its date, then takes the payment off', async () => {
    const { token, budgetId } = await createUserWithBudget();
    const payment = created(await makePayment(token, budgetId, { debt: card }));
    await debtInterestFrom(payment.id, { day: '2029-12-31' });

    const budget = budgetOf(await markPaid(token, budgetId, payment.id), 'markPaymentsPaid');

    // £1,200 + 31 days at 12% (£12.23) − £100
    expect(budget.recurringPayments[0].debt.balance).toBe(1112.23);
    expect(budget.bankBalance).toBe(900);
  });

  it('counts each day whatever the payment’s frequency', async () => {
    const { token, budgetId } = await createUserWithBudget();
    const payment = created(
      await makePayment(token, budgetId, { amount: 50, frequency: 'WEEKLY', debt: { balance: 5200, apr: 10 } })
    );
    await debtInterestFrom(payment.id, { day: '2030-01-24' });

    const budget = budgetOf(await markPaid(token, budgetId, payment.id), 'markPaymentsPaid');

    // £5,200 × 10% ÷ 365 × 7 days = £9.97 interest
    expect(budget.recurringPayments[0].debt.balance).toBe(5159.97);
  });

  it('adds what had built up at an earlier balance, then the days since at the new one', async () => {
    const { token, budgetId } = await createUserWithBudget();
    const payment = created(await makePayment(token, budgetId, { debt: { balance: 3650, apr: 10 } }));
    // £1 a day had built up for 10 days when £1,825 was paid off, halving it
    await debtInterestFrom(payment.id, { day: '2030-01-21', accrued: 10 });
    await mongoose.model('RecurringPayment').updateOne({ _id: payment.id }, { $set: { 'debt.balance': 1825 } });

    const budget = budgetOf(await markPaid(token, budgetId, payment.id), 'markPaymentsPaid');

    // £10 + 10 days at 50p
    expect(budget.recurringPayments[0].debt.balance).toBe(1825 + 15 - 100);
  });

  it('owes more when the payment is less than the interest', async () => {
    const { token, budgetId } = await createUserWithBudget();
    const payment = created(await makePayment(token, budgetId, { amount: 5, debt: card }));
    await monthBuiltUp(payment.id);

    const budget = budgetOf(await markPaid(token, budgetId, payment.id), 'markPaymentsPaid');

    expect(budget.recurringPayments[0].debt.balance).toBe(1207);
  });

  it('never goes below nothing left to pay', async () => {
    const { token, budgetId } = await createUserWithBudget();
    const payment = created(await makePayment(token, budgetId, { debt: { balance: 60, apr: 0 } }));

    const budget = budgetOf(await markPaid(token, budgetId, payment.id), 'markPaymentsPaid');

    expect(budget.recurringPayments[0].debt.balance).toBe(0);
    expect(budget.bankBalance).toBe(900);
  });

  it('puts the debt and bank balance back exactly when undone', async () => {
    const { token, budgetId } = await createUserWithBudget();
    const payment = created(await makePayment(token, budgetId, { debt: { balance: 60, apr: 0 } }));
    await markPaid(token, budgetId, payment.id);

    const budget = budgetOf(await markUnpaid(token, budgetId, payment.id), 'markPaymentsUnpaid');

    expect(budget.recurringPayments[0].debt.balance).toBe(60);
    expect(budget.bankBalance).toBe(1000);
  });
});

describe('interest built up on a debt', () => {
  const ACCRUAL = `query { budget { recurringPayments { id debt { balance accrued accruedTo } } } }`;
  const debtOf = async (token: string) => (await gql(ACCRUAL, undefined, token)).data.budget.recurringPayments[0].debt;
  const isoOf = (accruedTo: string) => new Date(Number(accruedTo)).toISOString().slice(0, 10);
  const today = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
  const update = (token: string, id: string, input: Variables) => gql(UPDATE, { id, input }, token);

  it('starts again from a balance typed from a statement, which already includes it', async () => {
    const { token, budgetId } = await createUserWithBudget();
    const payment = created(await makePayment(token, budgetId, { debt: card }));
    await debtInterestFrom(payment.id, { day: '2026-01-01', accrued: 40 });

    await update(token, payment.id, { debt: { ...card, balance: 1150 } });

    const debt = await debtOf(token);
    expect(debt.accrued).toBe(0);
    expect(isoOf(debt.accruedTo)).toBe(today());
  });

  it('keeps what’s built up when only the rate changes, counted at the old rate first', async () => {
    const { token, budgetId } = await createUserWithBudget();
    const payment = created(await makePayment(token, budgetId, { debt: { balance: 3650, apr: 10 } }));
    await debtInterestFrom(payment.id, { day: today(), accrued: 7 });

    await update(token, payment.id, { debt: { balance: 3650, apr: 20 } });

    expect(await debtOf(token)).toMatchObject({ accrued: 7, balance: 3650 });
  });

  it('counts a late payment up to its own date, and the days since after it', async () => {
    const { token, budgetId } = await createUserWithBudget();
    const payment = created(await makePayment(token, budgetId, { debt: card, firstPaymentDate: '2026-08-31' }));
    // Due on 31 Oct and still not marked paid
    await mongoose
      .model('RecurringPayment')
      .updateOne({ _id: payment.id }, { $set: { nextDueDate: new Date('2026-10-31T00:00:00Z') } });
    await debtInterestFrom(payment.id, { day: '2026-10-01' });

    await markPaid(token, budgetId, payment.id);

    // £1,200 + 30 days at 12% (£11.84) − £100
    const debt = await debtOf(token);
    expect(debt.balance).toBe(1111.84);
    expect(isoOf(debt.accruedTo)).toBe('2026-10-31');
    expect(debt.accrued).toBe(0);
  });

  it('puts what had built up back when the payment is undone', async () => {
    const { token, budgetId } = await createUserWithBudget();
    const payment = created(await makePayment(token, budgetId, { debt: card }));
    await debtInterestFrom(payment.id, { day: '2030-01-31', accrued: 12 });
    await markPaid(token, budgetId, payment.id);

    await markUnpaid(token, budgetId, payment.id);

    const debt = await debtOf(token);
    expect(debt).toMatchObject({ balance: 1200, accrued: 12 });
    expect(isoOf(debt.accruedTo)).toBe('2030-01-31');
  });

  it('counts what’s built up at the balance before an overpayment', async () => {
    const { token, budgetId } = await createUserWithBudget();
    const payment = created(await makePayment(token, budgetId, { debt: { balance: 3650, apr: 10 } }));
    const tenDaysAgo = new Date(Date.now() - 10 * 86_400_000).toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
    await debtInterestFrom(payment.id, { day: tenDaysAgo });

    await overpay(token, budgetId, payment.id, 1825);

    // £1 a day for ten days, at £3,650
    const debt = await debtOf(token);
    expect(debt.accrued).toBeCloseTo(10, 6);
    expect(isoOf(debt.accruedTo)).toBe(today());
  });
});

describe('undoing a payment', () => {
  it('gives back what was paid, even after the amount changes', async () => {
    const { token, budgetId } = await createUserWithBudget();
    const payment = created(await makePayment(token, budgetId, { amount: 20 }));
    await markPaid(token, budgetId, payment.id);
    await gql(UPDATE, { id: payment.id, input: { amount: 30 } }, token);

    const budget = budgetOf(await markUnpaid(token, budgetId, payment.id), 'markPaymentsUnpaid');

    expect(budget.bankBalance).toBe(1000);
  });
});

describe('logDebtOverpayment', () => {
  it('takes it off the debt and off the bank balance', async () => {
    const { token, budgetId } = await createUserWithBudget();
    const payment = created(await makePayment(token, budgetId, { debt: card }));

    const body = await overpay(token, budgetId, payment.id, 200);

    expect(body.data.logDebtOverpayment.success).toBe(true);
    const budget = budgetOf(body, 'logDebtOverpayment');
    expect(budget.recurringPayments[0].debt.balance).toBe(1000);
    expect(budget.bankBalance).toBe(800);
  });

  it('can clear what is left', async () => {
    const { token, budgetId } = await createUserWithBudget();
    const payment = created(await makePayment(token, budgetId, { debt: card }));

    const budget = budgetOf(await overpay(token, budgetId, payment.id, 1200), 'logDebtOverpayment');

    expect(budget.recurringPayments[0].debt.balance).toBe(0);
  });

  it("won't take more than is left to pay", async () => {
    const { token, budgetId } = await createUserWithBudget();
    const payment = created(await makePayment(token, budgetId, { debt: card }));

    const body = await overpay(token, budgetId, payment.id, 1200.01);

    expect(errorCode(body)).toBe('BAD_USER_INPUT');
    expect(fieldOf(body)).toBe('amount');
  });

  it.each([0, -10])('needs an amount above £0, not %d', async amount => {
    const { token, budgetId } = await createUserWithBudget();
    const payment = created(await makePayment(token, budgetId, { debt: card }));

    const body = await overpay(token, budgetId, payment.id, amount);

    expect(errorCode(body)).toBe('BAD_USER_INPUT');
    expect(fieldOf(body)).toBe('amount');
  });

  it('only works on a payment tracked as a debt', async () => {
    const { token, budgetId } = await createUserWithBudget();
    const payment = created(await makePayment(token, budgetId));

    const body = await overpay(token, budgetId, payment.id, 50);

    expect(errorCode(body)).toBe('DEBT_NOT_TRACKED');
  });

  it("can't be used on someone else's debt", async () => {
    const owner = await createUserWithBudget();
    const payment = created(await makePayment(owner.token, owner.budgetId, { debt: card }));
    const other = await createUserWithBudget();

    const sameBudget = await overpay(other.token, owner.budgetId, payment.id, 50);
    const ownBudget = await overpay(other.token, other.budgetId, payment.id, 50);

    expect(errorCode(sameBudget)).toBe('FORBIDDEN');
    expect(errorCode(ownBudget)).toBe('RECURRING_PAYMENT_NOT_FOUND');
  });
});

import {
  setupTestApp,
  teardownTestApp,
  clearDatabase,
  gql,
  errorCode,
  createUserWithAccount,
} from "../../helpers";
import { nextOccurrence, ukDay } from "../../../utils/dates";

beforeAll(setupTestApp);
afterAll(teardownTestApp);
beforeEach(clearDatabase);

const FIELDS = "id name nextDueDate status";
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
const PAID = `mutation ($input: MarkPaymentsPaidInput!) {
  markPaymentsPaid(input: $input) {
    account { bankBalance recurringPayments { id status } oneOffPayments { id } }
  }
}`;
const UNPAID = `mutation ($input: MarkPaymentsUnpaidInput!) {
  markPaymentsUnpaid(input: $input) { account { bankBalance recurringPayments { id status } } }
}`;
const SKIP = `mutation ($input: SkipRecurringPaymentsInput!) {
  skipRecurringPayments(input: $input) {
    success
    account { bankBalance recurringPayments { ${FIELDS} } }
  }
}`;

// Dates come back through GraphQL String as epoch milliseconds
const apiDate = (iso: string) => String(new Date(iso).getTime());

const createPayment = async (
  token: string,
  accountId: string,
  name: string,
  firstPaymentDate: string,
) => {
  const body = await gql(
    CREATE,
    {
      input: {
        accountId,
        name,
        amount: 20,
        category: "SUBSCRIPTION",
        frequency: "MONTHLY",
        type: "EXPENSE",
        firstPaymentDate,
      },
    },
    token,
  );
  return body.data.createRecurringPayment.recurringPayment;
};

// Marks recurring payments paid, as the dashboard does
const markPaid = (token: string, accountId: string, ids: string[]) =>
  gql(
    PAID,
    { input: { accountId, recurringPaymentIds: ids, oneOffPaymentIds: [] } },
    token,
  );

const skip = (token: string, accountId: string, ids: string[]) =>
  gql(SKIP, { input: { accountId, recurringPaymentIds: ids } }, token);

describe("recurring payment due dates", () => {
  it("is due on its first payment date when that is still to come, unpaid", async () => {
    const { token, accountId } = await createUserWithAccount();
    const payment = await createPayment(
      token,
      accountId,
      "Netflix",
      "2030-01-31",
    );

    expect(payment).toMatchObject({
      nextDueDate: apiDate("2030-01-31"),
      status: "UNPAID",
    });
  });

  it("is due on its next date from today when the first payment has passed", async () => {
    const { token, accountId } = await createUserWithAccount();
    const payment = await createPayment(token, accountId, "Gym", "2020-01-15");

    const expected = nextOccurrence(
      { firstPaymentDate: new Date("2020-01-15"), frequency: "MONTHLY" },
      ukDay(),
    );
    expect(payment.nextDueDate).toBe(String(expected?.getTime()));
  });

  it("is due from the account setup too", async () => {
    const { token, accountId } = await createUserWithAccount({
      account: {
        recurringPayments: [
          {
            name: "Rent",
            amount: 500,
            category: "RENT",
            frequency: "MONTHLY",
            type: "EXPENSE",
            firstPaymentDate: "2030-02-01",
          },
        ],
      },
    });
    const account = await gql(
      `query ($id: ID) { account(id: $id) { recurringPayments { ${FIELDS} } } }`,
      { id: accountId },
      token,
    );
    expect(account.data.account.recurringPayments[0]).toMatchObject({
      nextDueDate: apiDate("2030-02-01"),
      status: "UNPAID",
    });
  });

  it("can be marked paid or skipped without moving its date", async () => {
    const { token, accountId } = await createUserWithAccount();
    const netflix = await createPayment(
      token,
      accountId,
      "Netflix",
      "2030-01-31",
    );
    const gym = await createPayment(token, accountId, "Gym", "2030-01-10");

    await markPaid(token, accountId, [netflix.id]);
    const body = await skip(token, accountId, [gym.id]);

    const byName = Object.fromEntries(
      body.data.skipRecurringPayments.account.recurringPayments.map(
        (p: { name: string }) => [p.name, p],
      ),
    );
    expect(byName.Netflix).toMatchObject({
      nextDueDate: apiDate("2030-01-31"),
      status: "PAID",
    });
    expect(byName.Gym).toMatchObject({
      nextDueDate: apiDate("2030-01-10"),
      status: "SKIPPED",
    });
  });

  it("starts unpaid on its new date when the schedule changes", async () => {
    const { token, accountId } = await createUserWithAccount();
    const { id } = await createPayment(
      token,
      accountId,
      "Netflix",
      "2030-01-31",
    );
    await markPaid(token, accountId, [id]);

    const body = await gql(
      UPDATE,
      { id, input: { firstPaymentDate: "2030-03-05" } },
      token,
    );

    expect(body.data.updateRecurringPayment.recurringPayment).toMatchObject({
      nextDueDate: apiDate("2030-03-05"),
      status: "UNPAID",
    });
  });
});

describe("a new account", () => {
  it("counts setup as the start of its first cycle", async () => {
    const { token, accountId } = await createUserWithAccount();
    const body = await gql(
      `query ($id: ID) { account(id: $id) { cycleStartedOn } }`,
      { id: accountId },
      token,
    );
    expect(body.data.account.cycleStartedOn).toBe(String(ukDay().getTime()));
  });
});

describe("startPaydayCycle", () => {
  it("sets the balance and moves the chosen payments on to their next date as unpaid", async () => {
    const { token, accountId } = await createUserWithAccount();
    const netflix = await createPayment(
      token,
      accountId,
      "Netflix",
      "2030-01-31",
    );
    const gym = await createPayment(token, accountId, "Gym", "2030-01-10");
    await markPaid(token, accountId, [netflix.id, gym.id]);

    const body = await gql(
      START,
      {
        input: {
          accountId,
          payday: "2030-02-01",
          bankBalance: 2500.5,
          recurringPaymentIds: [netflix.id],
        },
      },
      token,
    );

    expect(body.errors).toBeUndefined();
    const { account } = body.data.startPaydayCycle;
    expect(account.bankBalance).toBe(2500.5);
    expect(account.cycleStartedOn).toBe(apiDate("2030-02-01"));
    const byName = Object.fromEntries(
      account.recurringPayments.map((p: { name: string }) => [p.name, p]),
    );
    // 31 Jan moves to the end of February
    expect(byName.Netflix).toMatchObject({
      nextDueDate: apiDate("2030-02-28"),
      status: "UNPAID",
    });
    // Not chosen, so left as it was
    expect(byName.Gym).toMatchObject({
      nextDueDate: apiDate("2030-01-10"),
      status: "PAID",
    });
  });

  it("moves skipped payments on as unpaid too", async () => {
    const { token, accountId } = await createUserWithAccount();
    const netflix = await createPayment(
      token,
      accountId,
      "Netflix",
      "2030-01-31",
    );
    await skip(token, accountId, [netflix.id]);

    const body = await gql(
      START,
      {
        input: {
          accountId,
          payday: "2030-02-01",
          bankBalance: 0,
          recurringPaymentIds: [netflix.id],
        },
      },
      token,
    );

    expect(
      body.data.startPaydayCycle.account.recurringPayments[0],
    ).toMatchObject({
      nextDueDate: apiDate("2030-02-28"),
      status: "UNPAID",
    });
  });

  it("leaves payments due from payday on where they are, as they belong to the new cycle", async () => {
    const { token, accountId } = await createUserWithAccount();
    const gym = await createPayment(token, accountId, "Gym", "2030-02-04");
    await markPaid(token, accountId, [gym.id]);

    const body = await gql(
      START,
      {
        input: {
          accountId,
          payday: "2030-01-31",
          bankBalance: 0,
          recurringPaymentIds: [gym.id],
        },
      },
      token,
    );

    expect(body.errors).toBeUndefined();
    expect(
      body.data.startPaydayCycle.account.recurringPayments[0],
    ).toMatchObject({
      nextDueDate: apiDate("2030-02-04"),
      status: "PAID",
    });
  });

  it("refuses another user's account", async () => {
    const owner = await createUserWithAccount();
    const other = await createUserWithAccount();

    const body = await gql(
      START,
      {
        input: {
          accountId: owner.accountId,
          payday: "2030-01-31",
          bankBalance: 0,
          recurringPaymentIds: [],
        },
      },
      other.token,
    );

    expect(errorCode(body)).toBe("FORBIDDEN");
  });

  it("refuses payments that aren't on the account", async () => {
    const owner = await createUserWithAccount();
    const other = await createUserWithAccount();
    const theirs = await createPayment(
      other.token,
      other.accountId,
      "Theirs",
      "2030-01-31",
    );

    const body = await gql(
      START,
      {
        input: {
          accountId: owner.accountId,
          payday: "2030-01-31",
          bankBalance: 0,
          recurringPaymentIds: [theirs.id],
        },
      },
      owner.token,
    );

    expect(errorCode(body)).toBe("RECURRING_PAYMENT_NOT_FOUND");
  });
});

describe("marking payments paid", () => {
  const ONE_OFF = `mutation ($input: CreateOneOffPaymentInput!) {
    createOneOffPayment(input: $input) { oneOffPayment { id } }
  }`;

  const oneOff = async (
    token: string,
    accountId: string,
    name: string,
    amount: number,
    type: string,
  ) =>
    (
      await gql(
        ONE_OFF,
        {
          input: {
            accountId,
            name,
            amount,
            dueDate: "2030-01-01",
            type,
            category: "OTHER",
          },
        },
        token,
      )
    ).data.createOneOffPayment.oneOffPayment.id;

  it("takes recurring payments off the balance and marks them paid", async () => {
    const { token, accountId } = await createUserWithAccount();
    const netflix = await createPayment(
      token,
      accountId,
      "Netflix",
      "2030-01-31",
    );

    const body = await markPaid(token, accountId, [netflix.id]);

    expect(body.errors).toBeUndefined();
    const { account } = body.data.markPaymentsPaid;
    // The test account starts with £1,000 and Netflix is £20
    expect(account.bankBalance).toBe(980);
    expect(account.recurringPayments).toEqual([
      { id: netflix.id, status: "PAID" },
    ]);
  });

  it("doesn't take a payment off twice", async () => {
    const { token, accountId } = await createUserWithAccount();
    const netflix = await createPayment(
      token,
      accountId,
      "Netflix",
      "2030-01-31",
    );

    await markPaid(token, accountId, [netflix.id]);
    const body = await markPaid(token, accountId, [netflix.id]);

    expect(body.data.markPaymentsPaid.account.bankBalance).toBe(980);
  });

  it("settles one-off payments, adding income, and deletes them", async () => {
    const { token, accountId } = await createUserWithAccount();
    const gift = await oneOff(token, accountId, "Gift", 75.5, "EXPENSE");
    const refund = await oneOff(token, accountId, "Refund", 10, "INCOME");
    const kept = await oneOff(token, accountId, "Later", 5, "EXPENSE");

    const body = await gql(
      PAID,
      {
        input: {
          accountId,
          recurringPaymentIds: [],
          oneOffPaymentIds: [gift, refund],
        },
      },
      token,
    );

    const { account } = body.data.markPaymentsPaid;
    expect(account.bankBalance).toBe(934.5);
    expect(account.oneOffPayments).toEqual([{ id: kept }]);
  });

  it("returns whatever is selected on the account, notes included", async () => {
    const { token, accountId } = await createUserWithAccount();
    await gql(
      `mutation ($input: CreateNoteInput!) { createNote(input: $input) { success } }`,
      { input: { accountId, body: "Pay rent" } },
      token,
    );

    const body = await gql(
      `mutation ($input: MarkPaymentsPaidInput!) {
        markPaymentsPaid(input: $input) { account { id notes { body } } }
      }`,
      { input: { accountId, recurringPaymentIds: [], oneOffPaymentIds: [] } },
      token,
    );

    expect(body.errors).toBeUndefined();
    expect(body.data.markPaymentsPaid.account).toEqual({
      id: accountId,
      notes: [{ body: "Pay rent" }],
    });
  });

  it("puts the amount back when a recurring payment is marked unpaid", async () => {
    const { token, accountId } = await createUserWithAccount();
    const netflix = await createPayment(
      token,
      accountId,
      "Netflix",
      "2030-01-31",
    );
    await markPaid(token, accountId, [netflix.id]);

    const body = await gql(
      UNPAID,
      { input: { accountId, recurringPaymentIds: [netflix.id] } },
      token,
    );

    expect(body.data.markPaymentsUnpaid.account).toEqual({
      bankBalance: 1000,
      recurringPayments: [{ id: netflix.id, status: "UNPAID" }],
    });
  });

  it("turns a skipped payment back to unpaid without touching the balance", async () => {
    const { token, accountId } = await createUserWithAccount();
    const netflix = await createPayment(
      token,
      accountId,
      "Netflix",
      "2030-01-31",
    );
    await skip(token, accountId, [netflix.id]);

    const body = await gql(
      UNPAID,
      { input: { accountId, recurringPaymentIds: [netflix.id] } },
      token,
    );

    expect(body.errors).toBeUndefined();
    expect(body.data.markPaymentsUnpaid.account).toEqual({
      bankBalance: 1000,
      recurringPayments: [{ id: netflix.id, status: "UNPAID" }],
    });
  });

  it("refuses another user's account", async () => {
    const owner = await createUserWithAccount();
    const other = await createUserWithAccount();

    const body = await gql(
      PAID,
      {
        input: {
          accountId: owner.accountId,
          recurringPaymentIds: [],
          oneOffPaymentIds: [],
        },
      },
      other.token,
    );

    expect(errorCode(body)).toBe("FORBIDDEN");
  });
});

describe("skipRecurringPayments", () => {
  it("skips unpaid payments without touching the balance", async () => {
    const { token, accountId } = await createUserWithAccount();
    const netflix = await createPayment(
      token,
      accountId,
      "Netflix",
      "2030-01-31",
    );

    const body = await skip(token, accountId, [netflix.id]);

    expect(body.errors).toBeUndefined();
    const { success, account } = body.data.skipRecurringPayments;
    expect(success).toBe(true);
    expect(account.bankBalance).toBe(1000);
    expect(account.recurringPayments).toEqual([
      expect.objectContaining({ id: netflix.id, status: "SKIPPED" }),
    ]);
  });

  it("leaves paid payments alone, as their amounts have already come off", async () => {
    const { token, accountId } = await createUserWithAccount();
    const netflix = await createPayment(
      token,
      accountId,
      "Netflix",
      "2030-01-31",
    );
    const gym = await createPayment(token, accountId, "Gym", "2030-01-10");
    await markPaid(token, accountId, [netflix.id]);

    const body = await skip(token, accountId, [netflix.id, gym.id]);

    expect(body.errors).toBeUndefined();
    const { account } = body.data.skipRecurringPayments;
    // Only Netflix's £20 has come off
    expect(account.bankBalance).toBe(980);
    const byName = Object.fromEntries(
      account.recurringPayments.map((p: { name: string }) => [p.name, p]),
    );
    expect(byName.Netflix.status).toBe("PAID");
    expect(byName.Gym.status).toBe("SKIPPED");
  });

  it("refuses payments that aren't on the account", async () => {
    const owner = await createUserWithAccount();
    const other = await createUserWithAccount();
    const theirs = await createPayment(
      other.token,
      other.accountId,
      "Theirs",
      "2030-01-31",
    );

    const body = await skip(owner.token, owner.accountId, [theirs.id]);

    expect(errorCode(body)).toBe("RECURRING_PAYMENT_NOT_FOUND");
  });

  it("refuses another user's account", async () => {
    const owner = await createUserWithAccount();
    const other = await createUserWithAccount();
    const netflix = await createPayment(
      owner.token,
      owner.accountId,
      "Netflix",
      "2030-01-31",
    );

    const body = await skip(other.token, owner.accountId, [netflix.id]);

    expect(errorCode(body)).toBe("FORBIDDEN");
    const mine = await gql(
      `query { account { recurringPayments { status } } }`,
      undefined,
      owner.token,
    );
    expect(mine.data.account.recurringPayments).toEqual([{ status: "UNPAID" }]);
  });

  it("requires authentication", async () => {
    const { accountId } = await createUserWithAccount();
    const body = await gql(SKIP, {
      input: { accountId, recurringPaymentIds: [] },
    });
    expect(errorCode(body)).toBe("UNAUTHENTICATED");
  });
});

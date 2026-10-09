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

const FIELDS = "id name nextDueDate handled { outcome dates }";
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
    account { bankBalance recurringPayments { ${FIELDS} } oneOffPayments { id } }
  }
}`;
const UNPAID = `mutation ($input: MarkPaymentsUnpaidInput!) {
  markPaymentsUnpaid(input: $input) {
    account { bankBalance recurringPayments { ${FIELDS} } }
  }
}`;
const SKIP = `mutation ($input: SkipRecurringPaymentsInput!) {
  skipRecurringPayments(input: $input) {
    success
    account { bankBalance recurringPayments { ${FIELDS} } }
  }
}`;

// Dates come back through GraphQL String as epoch milliseconds
const apiDate = (iso: string) => String(new Date(iso).getTime());

const paid = (...dates: string[]) => ({
  outcome: "PAID",
  dates: dates.map(apiDate),
});
const skipped = (...dates: string[]) => ({
  outcome: "SKIPPED",
  dates: dates.map(apiDate),
});

// A £20 monthly expense unless the fields say otherwise
const createPayment = async (
  token: string,
  accountId: string,
  name: string,
  firstPaymentDate: string,
  fields: Record<string, unknown> = {},
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
        ...fields,
      },
    },
    token,
  );
  return body.data.createRecurringPayment.recurringPayment;
};

// Pays recurring payments' next dates, as the dashboard does
const markPaid = (token: string, accountId: string, ids: string[]) =>
  gql(
    PAID,
    { input: { accountId, recurringPaymentIds: ids, oneOffPaymentIds: [] } },
    token,
  );

const markUnpaid = (token: string, accountId: string, ids: string[]) =>
  gql(UNPAID, { input: { accountId, recurringPaymentIds: ids } }, token);

const skip = (
  token: string,
  accountId: string,
  ids: string[],
  until?: string,
) => gql(SKIP, { input: { accountId, recurringPaymentIds: ids, until } }, token);

const startCycle = (
  token: string,
  accountId: string,
  payday: string,
  recurringPaymentIds: string[],
) =>
  gql(
    START,
    { input: { accountId, payday, bankBalance: 0, recurringPaymentIds } },
    token,
  );

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const byName = (payments: any[]): Record<string, any> =>
  Object.fromEntries(payments.map((payment) => [payment.name, payment]));

describe("recurring payment due dates", () => {
  it("is due on its first payment date when that is still to come, with nothing handled", async () => {
    const { token, accountId } = await createUserWithAccount();
    const payment = await createPayment(
      token,
      accountId,
      "Netflix",
      "2030-01-31",
    );

    expect(payment).toMatchObject({
      nextDueDate: apiDate("2030-01-31"),
      handled: [],
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
      handled: [],
    });
  });

  it("moves on to its next date once paid or skipped, recording the date it dealt with", async () => {
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

    const payments = byName(
      body.data.skipRecurringPayments.account.recurringPayments,
    );
    // 31 Jan moves on to the end of February
    expect(payments.Netflix).toMatchObject({
      nextDueDate: apiDate("2030-02-28"),
      handled: [paid("2030-01-31")],
    });
    expect(payments.Gym).toMatchObject({
      nextDueDate: apiDate("2030-02-10"),
      handled: [skipped("2030-01-10")],
    });
  });

  it("starts again on its new date when the schedule changes", async () => {
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
      handled: [],
    });
  });

  it("keeps what's been paid when only its last payment changes", async () => {
    const { token, accountId } = await createUserWithAccount();
    const { id } = await createPayment(token, accountId, "Phone", "2030-01-10");
    await markPaid(token, accountId, [id]);

    const body = await gql(
      UPDATE,
      { id, input: { lastPaymentDate: "2030-06-10" } },
      token,
    );

    expect(body.data.updateRecurringPayment.recurringPayment).toMatchObject({
      nextDueDate: apiDate("2030-02-10"),
      handled: [paid("2030-01-10")],
    });
  });

  it("has no date left when its new last payment is before the date due", async () => {
    const { token, accountId } = await createUserWithAccount();
    const { id } = await createPayment(token, accountId, "Phone", "2030-01-10");
    await markPaid(token, accountId, [id]);

    const body = await gql(
      UPDATE,
      { id, input: { lastPaymentDate: "2030-01-10" } },
      token,
    );

    expect(body.data.updateRecurringPayment.recurringPayment).toMatchObject({
      nextDueDate: null,
      handled: [paid("2030-01-10")],
    });
  });

  it("carries on after the latest date paid when an ended payment's last payment is removed", async () => {
    const { token, accountId } = await createUserWithAccount();
    const { id } = await createPayment(token, accountId, "Phone", "2030-01-10", {
      lastPaymentDate: "2030-01-10",
    });
    await markPaid(token, accountId, [id]);

    const body = await gql(
      UPDATE,
      { id, input: { lastPaymentDate: null } },
      token,
    );

    expect(body.data.updateRecurringPayment.recurringPayment).toMatchObject({
      nextDueDate: apiDate("2030-02-10"),
      handled: [paid("2030-01-10")],
    });
  });

  it("keeps its dates when its renewal changes", async () => {
    const { token, accountId } = await createUserWithAccount();
    const { id } = await createPayment(token, accountId, "Phone", "2030-01-10");
    await markPaid(token, accountId, [id]);

    const body = await gql(
      UPDATE,
      { id, input: { renewalDate: "2031-01-10", renewalReminderDays: 30 } },
      token,
    );

    expect(body.data.updateRecurringPayment.recurringPayment).toMatchObject({
      nextDueDate: apiDate("2030-02-10"),
      handled: [paid("2030-01-10")],
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
  it("sets the balance and moves the chosen payments on from dates left over", async () => {
    const { token, accountId } = await createUserWithAccount();
    const netflix = await createPayment(
      token,
      accountId,
      "Netflix",
      "2030-01-31",
    );
    const gym = await createPayment(token, accountId, "Gym", "2030-01-10");

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
    const payments = byName(account.recurringPayments);
    expect(payments.Netflix.nextDueDate).toBe(apiDate("2030-02-28"));
    // Not chosen, so still due on its date in the last cycle
    expect(payments.Gym.nextDueDate).toBe(apiDate("2030-01-10"));
  });

  it("clears what was paid or skipped in the cycle that ended", async () => {
    const { token, accountId } = await createUserWithAccount();
    const netflix = await createPayment(
      token,
      accountId,
      "Netflix",
      "2030-01-31",
    );
    const gym = await createPayment(token, accountId, "Gym", "2030-01-10");
    await markPaid(token, accountId, [netflix.id]);
    await skip(token, accountId, [gym.id]);

    const body = await startCycle(token, accountId, "2030-02-01", []);

    const payments = byName(body.data.startPaydayCycle.account.recurringPayments);
    expect(payments.Netflix).toMatchObject({
      nextDueDate: apiDate("2030-02-28"),
      handled: [],
    });
    expect(payments.Gym).toMatchObject({
      nextDueDate: apiDate("2030-02-10"),
      handled: [],
    });
  });

  it("keeps dates dealt with from payday on, so they can still be undone", async () => {
    const { token, accountId } = await createUserWithAccount();
    const cleaner = await createPayment(
      token,
      accountId,
      "Cleaner",
      "2030-01-28",
      { frequency: "WEEKLY" },
    );
    await markPaid(token, accountId, [cleaner.id]);
    await markPaid(token, accountId, [cleaner.id]);

    const body = await startCycle(token, accountId, "2030-02-01", [cleaner.id]);

    expect(body.data.startPaydayCycle.account.recurringPayments[0]).toMatchObject({
      nextDueDate: apiDate("2030-02-11"),
      handled: [paid("2030-02-04")],
    });
  });

  it("moves a payment on to its first date from payday, not from today", async () => {
    const { token, accountId } = await createUserWithAccount();
    const cleaner = await createPayment(
      token,
      accountId,
      "Cleaner",
      "2030-01-21",
      { frequency: "WEEKLY" },
    );

    const body = await startCycle(token, accountId, "2030-02-01", [cleaner.id]);

    expect(
      body.data.startPaydayCycle.account.recurringPayments[0].nextDueDate,
    ).toBe(apiDate("2030-02-04"));
  });

  it("leaves payments due from payday on where they are, as they belong to the new cycle", async () => {
    const { token, accountId } = await createUserWithAccount();
    const gym = await createPayment(token, accountId, "Gym", "2030-02-04");

    const body = await startCycle(token, accountId, "2030-01-31", [gym.id]);

    expect(body.errors).toBeUndefined();
    expect(
      body.data.startPaydayCycle.account.recurringPayments[0].nextDueDate,
    ).toBe(apiDate("2030-02-04"));
  });

  it("refuses another user's account", async () => {
    const owner = await createUserWithAccount();
    const other = await createUserWithAccount();

    const body = await startCycle(other.token, owner.accountId, "2030-01-31", []);

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

    const body = await startCycle(owner.token, owner.accountId, "2030-01-31", [
      theirs.id,
    ]);

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

  it("takes a recurring payment off the balance and moves it on to its next date", async () => {
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
      expect.objectContaining({
        nextDueDate: apiDate("2030-02-28"),
        handled: [paid("2030-01-31")],
      }),
    ]);
  });

  it("pays one date at a time, for a payment due more than once a cycle", async () => {
    const { token, accountId } = await createUserWithAccount();
    const cleaner = await createPayment(
      token,
      accountId,
      "Cleaner",
      "2030-01-07",
      { frequency: "WEEKLY" },
    );

    await markPaid(token, accountId, [cleaner.id]);
    const body = await markPaid(token, accountId, [cleaner.id]);

    const { account } = body.data.markPaymentsPaid;
    expect(account.bankBalance).toBe(960);
    expect(account.recurringPayments[0]).toMatchObject({
      nextDueDate: apiDate("2030-01-21"),
      handled: [paid("2030-01-07"), paid("2030-01-14")],
    });
  });

  it("has nothing to pay once a payment has ended", async () => {
    const { token, accountId } = await createUserWithAccount();
    const ended = await createPayment(token, accountId, "Old gym", "2020-01-15", {
      lastPaymentDate: "2020-03-15",
    });

    const body = await markPaid(token, accountId, [ended.id]);

    const { account } = body.data.markPaymentsPaid;
    expect(account.bankBalance).toBe(1000);
    expect(account.recurringPayments[0]).toMatchObject({
      nextDueDate: null,
      handled: [],
    });
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

describe("markPaymentsUnpaid", () => {
  it("puts the amount back and brings the paid date back", async () => {
    const { token, accountId } = await createUserWithAccount();
    const netflix = await createPayment(
      token,
      accountId,
      "Netflix",
      "2030-01-31",
    );
    await markPaid(token, accountId, [netflix.id]);

    const body = await markUnpaid(token, accountId, [netflix.id]);

    const { account } = body.data.markPaymentsUnpaid;
    expect(account.bankBalance).toBe(1000);
    expect(account.recurringPayments[0]).toMatchObject({
      nextDueDate: apiDate("2030-01-31"),
      handled: [],
    });
  });

  it("undoes only the latest date paid", async () => {
    const { token, accountId } = await createUserWithAccount();
    const cleaner = await createPayment(
      token,
      accountId,
      "Cleaner",
      "2030-01-07",
      { frequency: "WEEKLY" },
    );
    await markPaid(token, accountId, [cleaner.id]);
    await markPaid(token, accountId, [cleaner.id]);

    const body = await markUnpaid(token, accountId, [cleaner.id]);

    const { account } = body.data.markPaymentsUnpaid;
    expect(account.bankBalance).toBe(980);
    expect(account.recurringPayments[0]).toMatchObject({
      nextDueDate: apiDate("2030-01-14"),
      handled: [paid("2030-01-07")],
    });
  });

  it("brings a skipped date back without touching the balance", async () => {
    const { token, accountId } = await createUserWithAccount();
    const netflix = await createPayment(
      token,
      accountId,
      "Netflix",
      "2030-01-31",
    );
    await skip(token, accountId, [netflix.id]);

    const body = await markUnpaid(token, accountId, [netflix.id]);

    expect(body.errors).toBeUndefined();
    const { account } = body.data.markPaymentsUnpaid;
    expect(account.bankBalance).toBe(1000);
    expect(account.recurringPayments[0]).toMatchObject({
      nextDueDate: apiDate("2030-01-31"),
      handled: [],
    });
  });

  it("leaves a payment with nothing to undo alone", async () => {
    const { token, accountId } = await createUserWithAccount();
    const netflix = await createPayment(
      token,
      accountId,
      "Netflix",
      "2030-01-31",
    );

    const body = await markUnpaid(token, accountId, [netflix.id]);

    const { account } = body.data.markPaymentsUnpaid;
    expect(account.bankBalance).toBe(1000);
    expect(account.recurringPayments[0].nextDueDate).toBe(apiDate("2030-01-31"));
  });
});

describe("skipRecurringPayments", () => {
  it("skips the next date without touching the balance", async () => {
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
    expect(account.recurringPayments[0]).toMatchObject({
      nextDueDate: apiDate("2030-02-28"),
      handled: [skipped("2030-01-31")],
    });
  });

  it("skips the date after one already paid", async () => {
    const { token, accountId } = await createUserWithAccount();
    const netflix = await createPayment(
      token,
      accountId,
      "Netflix",
      "2030-01-31",
    );
    await markPaid(token, accountId, [netflix.id]);

    const body = await skip(token, accountId, [netflix.id]);

    const { account } = body.data.skipRecurringPayments;
    // Only the paid date's £20 has come off
    expect(account.bankBalance).toBe(980);
    expect(account.recurringPayments[0]).toMatchObject({
      nextDueDate: apiDate("2030-03-31"),
      handled: [paid("2030-01-31"), skipped("2030-02-28")],
    });
  });

  it("skips every date before until at once, and brings them back together", async () => {
    const { token, accountId } = await createUserWithAccount();
    const cleaner = await createPayment(
      token,
      accountId,
      "Cleaner",
      "2030-01-07",
      { frequency: "WEEKLY" },
    );

    const body = await skip(token, accountId, [cleaner.id], "2030-01-31");

    expect(body.data.skipRecurringPayments.account.recurringPayments[0]).toMatchObject({
      nextDueDate: apiDate("2030-02-04"),
      handled: [skipped("2030-01-07", "2030-01-14", "2030-01-21", "2030-01-28")],
    });

    const undone = await markUnpaid(token, accountId, [cleaner.id]);
    expect(undone.data.markPaymentsUnpaid.account.recurringPayments[0]).toMatchObject({
      nextDueDate: apiDate("2030-01-07"),
      handled: [],
    });
  });

  it("skips nothing when the next date is from until on", async () => {
    const { token, accountId } = await createUserWithAccount();
    const netflix = await createPayment(
      token,
      accountId,
      "Netflix",
      "2030-01-31",
    );

    const body = await skip(token, accountId, [netflix.id], "2030-01-31");

    expect(body.data.skipRecurringPayments.account.recurringPayments[0]).toMatchObject({
      nextDueDate: apiDate("2030-01-31"),
      handled: [],
    });
  });

  it("rejects an until that isn't a date", async () => {
    const { token, accountId } = await createUserWithAccount();
    const netflix = await createPayment(
      token,
      accountId,
      "Netflix",
      "2030-01-31",
    );

    const body = await skip(token, accountId, [netflix.id], "next payday");

    expect(errorCode(body)).toBe("BAD_USER_INPUT");
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
      `query { account { recurringPayments { handled { outcome } } } }`,
      undefined,
      owner.token,
    );
    expect(mine.data.account.recurringPayments).toEqual([{ handled: [] }]);
  });

  it("requires authentication", async () => {
    const { accountId } = await createUserWithAccount();
    const body = await gql(SKIP, {
      input: { accountId, recurringPaymentIds: [] },
    });
    expect(errorCode(body)).toBe("UNAUTHENTICATED");
  });
});

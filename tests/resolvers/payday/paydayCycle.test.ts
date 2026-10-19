import {
  setupTestApp,
  teardownTestApp,
  clearDatabase,
  gql,
  errorCode,
  createUserWithBudget,
} from "../../helpers";
import mongoose from "mongoose";
import { nextOccurrence, ukDay } from "../../../utils/dates";

beforeAll(setupTestApp);
afterAll(teardownTestApp);
beforeEach(clearDatabase);

const FIELDS = "id name nextDueDate thisCycle { kind dates }";
const CREATE = `mutation ($input: CreateRecurringPaymentInput!) {
  createRecurringPayment(input: $input) { recurringPayment { ${FIELDS} } }
}`;
const UPDATE = `mutation ($id: ID!, $input: UpdateRecurringPaymentInput!) {
  updateRecurringPayment(id: $id, input: $input) { recurringPayment { ${FIELDS} } }
}`;
const START = `mutation ($input: StartPaydayCycleInput!) {
  startPaydayCycle(input: $input) {
    success
    budget { bankBalance cycleStartedOn recurringPayments { ${FIELDS} } }
  }
}`;
const PAID = `mutation ($input: MarkPaymentsPaidInput!) {
  markPaymentsPaid(input: $input) {
    budget { bankBalance recurringPayments { ${FIELDS} } oneOffPayments { id paidAt } }
  }
}`;
const UNPAID = `mutation ($input: MarkPaymentsUnpaidInput!) {
  markPaymentsUnpaid(input: $input) {
    budget { bankBalance recurringPayments { ${FIELDS} } }
  }
}`;
const SKIP = `mutation ($input: SkipRecurringPaymentsInput!) {
  skipRecurringPayments(input: $input) {
    success
    budget { bankBalance recurringPayments { ${FIELDS} } }
  }
}`;

// Dates come back through GraphQL String as epoch milliseconds
const apiDate = (iso: string) => String(new Date(iso).getTime());

const paid = (...dates: string[]) => ({
  kind: "PAID",
  dates: dates.map(apiDate),
});
const skipped = (...dates: string[]) => ({
  kind: "SKIPPED",
  dates: dates.map(apiDate),
});

// A £20 monthly expense unless the fields say otherwise
const createPayment = async (
  token: string,
  budgetId: string,
  name: string,
  firstPaymentDate: string,
  fields: Record<string, unknown> = {},
) => {
  const body = await gql(
    CREATE,
    {
      input: {
        budgetId,
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
const markPaid = (token: string, budgetId: string, ids: string[]) =>
  gql(
    PAID,
    { input: { budgetId, recurringPaymentIds: ids, oneOffPaymentIds: [] } },
    token,
  );

const markUnpaid = (token: string, budgetId: string, ids: string[]) =>
  gql(UNPAID, { input: { budgetId, recurringPaymentIds: ids } }, token);

const skip = (
  token: string,
  budgetId: string,
  ids: string[],
  until?: string,
) => gql(SKIP, { input: { budgetId, recurringPaymentIds: ids, until } }, token);

// Starts a cycle, saying the left-over payments listed didn't go out, so they move on as skipped
const startCycle = (
  token: string,
  budgetId: string,
  payday: string,
  skippedIds: string[],
) =>
  gql(
    START,
    {
      input: {
        budgetId,
        payday,
        bankBalance: 0,
        leftOver: skippedIds.map((recurringPaymentId) => ({ recurringPaymentId, outcome: "SKIPPED" })),
      },
    },
    token,
  );

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const byName = (payments: any[]): Record<string, any> =>
  Object.fromEntries(payments.map((payment) => [payment.name, payment]));

describe("recurring payment due dates", () => {
  it("is due on its first payment date when that is still to come, with nothing paid or skipped", async () => {
    const { token, budgetId } = await createUserWithBudget();
    const payment = await createPayment(
      token,
      budgetId,
      "Netflix",
      "2030-01-31",
    );

    expect(payment).toMatchObject({
      nextDueDate: apiDate("2030-01-31"),
      thisCycle: [],
    });
  });

  it("is due on its next date from today when the first payment has passed", async () => {
    const { token, budgetId } = await createUserWithBudget();
    const payment = await createPayment(token, budgetId, "Gym", "2020-01-15");

    const expected = nextOccurrence(
      { firstPaymentDate: new Date("2020-01-15"), frequency: "MONTHLY" },
      ukDay(),
    );
    expect(payment.nextDueDate).toBe(String(expected?.getTime()));
  });

  it("is due from the budget setup too", async () => {
    const { token, budgetId } = await createUserWithBudget({
      budget: {
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
    const budget = await gql(
      `query ($id: ID) { budget(id: $id) { recurringPayments { ${FIELDS} } } }`,
      { id: budgetId },
      token,
    );
    expect(budget.data.budget.recurringPayments[0]).toMatchObject({
      nextDueDate: apiDate("2030-02-01"),
      thisCycle: [],
    });
  });

  it("moves on to its next date once paid or skipped, recording the date it dealt with", async () => {
    const { token, budgetId } = await createUserWithBudget();
    const netflix = await createPayment(
      token,
      budgetId,
      "Netflix",
      "2030-01-31",
    );
    const gym = await createPayment(token, budgetId, "Gym", "2030-01-10");

    await markPaid(token, budgetId, [netflix.id]);
    const body = await skip(token, budgetId, [gym.id]);

    const payments = byName(
      body.data.skipRecurringPayments.budget.recurringPayments,
    );
    // 31 Jan moves on to the end of February
    expect(payments.Netflix).toMatchObject({
      nextDueDate: apiDate("2030-02-28"),
      thisCycle: [paid("2030-01-31")],
    });
    expect(payments.Gym).toMatchObject({
      nextDueDate: apiDate("2030-02-10"),
      thisCycle: [skipped("2030-01-10")],
    });
  });

  it("starts again on its new date when the schedule changes", async () => {
    const { token, budgetId } = await createUserWithBudget();
    const { id } = await createPayment(
      token,
      budgetId,
      "Netflix",
      "2030-01-31",
    );
    await markPaid(token, budgetId, [id]);

    const body = await gql(
      UPDATE,
      { id, input: { firstPaymentDate: "2030-03-05" } },
      token,
    );

    expect(body.data.updateRecurringPayment.recurringPayment).toMatchObject({
      nextDueDate: apiDate("2030-03-05"),
      thisCycle: [],
    });
  });

  it("keeps what's been paid when only its last payment changes", async () => {
    const { token, budgetId } = await createUserWithBudget();
    const { id } = await createPayment(token, budgetId, "Phone", "2030-01-10");
    await markPaid(token, budgetId, [id]);

    const body = await gql(
      UPDATE,
      { id, input: { lastPaymentDate: "2030-06-10" } },
      token,
    );

    expect(body.data.updateRecurringPayment.recurringPayment).toMatchObject({
      nextDueDate: apiDate("2030-02-10"),
      thisCycle: [paid("2030-01-10")],
    });
  });

  it("has no date left when its new last payment is before the date due", async () => {
    const { token, budgetId } = await createUserWithBudget();
    const { id } = await createPayment(token, budgetId, "Phone", "2030-01-10");
    await markPaid(token, budgetId, [id]);

    const body = await gql(
      UPDATE,
      { id, input: { lastPaymentDate: "2030-01-10" } },
      token,
    );

    expect(body.data.updateRecurringPayment.recurringPayment).toMatchObject({
      nextDueDate: null,
      thisCycle: [paid("2030-01-10")],
    });
  });

  it("carries on after the latest date paid when an ended payment's last payment is removed", async () => {
    const { token, budgetId } = await createUserWithBudget();
    const { id } = await createPayment(token, budgetId, "Phone", "2030-01-10", {
      lastPaymentDate: "2030-01-10",
    });
    await markPaid(token, budgetId, [id]);

    const body = await gql(
      UPDATE,
      { id, input: { lastPaymentDate: null } },
      token,
    );

    expect(body.data.updateRecurringPayment.recurringPayment).toMatchObject({
      nextDueDate: apiDate("2030-02-10"),
      thisCycle: [paid("2030-01-10")],
    });
  });

  it("keeps its dates when its renewal changes", async () => {
    const { token, budgetId } = await createUserWithBudget();
    const { id } = await createPayment(token, budgetId, "Phone", "2030-01-10");
    await markPaid(token, budgetId, [id]);

    const body = await gql(
      UPDATE,
      { id, input: { renewalDate: "2031-01-10", renewalReminder: { off: false, days: 30 } } },
      token,
    );

    expect(body.data.updateRecurringPayment.recurringPayment).toMatchObject({
      nextDueDate: apiDate("2030-02-10"),
      thisCycle: [paid("2030-01-10")],
    });
  });
});

describe("a new budget", () => {
  it("counts setup as the start of its first cycle", async () => {
    const { token, budgetId } = await createUserWithBudget();
    const body = await gql(
      `query ($id: ID) { budget(id: $id) { cycleStartedOn } }`,
      { id: budgetId },
      token,
    );
    expect(body.data.budget.cycleStartedOn).toBe(String(ukDay().getTime()));
  });
});

describe("startPaydayCycle", () => {
  it("sets the balance and moves on left-over payments that are paid or skipped", async () => {
    const { token, budgetId } = await createUserWithBudget();
    const netflix = await createPayment(
      token,
      budgetId,
      "Netflix",
      "2030-01-31",
    );
    const gym = await createPayment(token, budgetId, "Gym", "2030-01-10");

    const body = await gql(
      START,
      {
        input: {
          budgetId,
          payday: "2030-02-01",
          bankBalance: 2500.5,
          leftOver: [{ recurringPaymentId: netflix.id, outcome: "SKIPPED" }],
        },
      },
      token,
    );

    expect(body.errors).toBeUndefined();
    const { budget } = body.data.startPaydayCycle;
    expect(budget.bankBalance).toBe(2500.5);
    expect(budget.cycleStartedOn).toBe(apiDate("2030-02-01"));
    const payments = byName(budget.recurringPayments);
    expect(payments.Netflix.nextDueDate).toBe(apiDate("2030-02-28"));
    // Not listed, so still due on its date in the last cycle
    expect(payments.Gym.nextDueDate).toBe(apiDate("2030-01-10"));
  });

  it("clears what was paid or skipped in the cycle that ended", async () => {
    const { token, budgetId } = await createUserWithBudget();
    const netflix = await createPayment(
      token,
      budgetId,
      "Netflix",
      "2030-01-31",
    );
    const gym = await createPayment(token, budgetId, "Gym", "2030-01-10");
    await markPaid(token, budgetId, [netflix.id]);
    await skip(token, budgetId, [gym.id]);

    const body = await startCycle(token, budgetId, "2030-02-01", []);

    const payments = byName(body.data.startPaydayCycle.budget.recurringPayments);
    expect(payments.Netflix).toMatchObject({
      nextDueDate: apiDate("2030-02-28"),
      thisCycle: [],
    });
    expect(payments.Gym).toMatchObject({
      nextDueDate: apiDate("2030-02-10"),
      thisCycle: [],
    });
  });

  it("keeps dates dealt with from payday on, so they can still be undone", async () => {
    const { token, budgetId } = await createUserWithBudget();
    const cleaner = await createPayment(
      token,
      budgetId,
      "Cleaner",
      "2030-01-28",
      { frequency: "WEEKLY" },
    );
    await markPaid(token, budgetId, [cleaner.id]);
    await markPaid(token, budgetId, [cleaner.id]);

    const body = await startCycle(token, budgetId, "2030-02-01", [cleaner.id]);

    expect(body.data.startPaydayCycle.budget.recurringPayments[0]).toMatchObject({
      nextDueDate: apiDate("2030-02-11"),
      thisCycle: [paid("2030-02-04")],
    });
  });

  it("moves a payment on to its first date from payday, not from today", async () => {
    const { token, budgetId } = await createUserWithBudget();
    const cleaner = await createPayment(
      token,
      budgetId,
      "Cleaner",
      "2030-01-21",
      { frequency: "WEEKLY" },
    );

    const body = await startCycle(token, budgetId, "2030-02-01", [cleaner.id]);

    expect(
      body.data.startPaydayCycle.budget.recurringPayments[0].nextDueDate,
    ).toBe(apiDate("2030-02-04"));
  });

  it("leaves payments due from payday on where they are, as they belong to the new cycle", async () => {
    const { token, budgetId } = await createUserWithBudget();
    const gym = await createPayment(token, budgetId, "Gym", "2030-02-04");

    const body = await startCycle(token, budgetId, "2030-01-31", [gym.id]);

    expect(body.errors).toBeUndefined();
    expect(
      body.data.startPaydayCycle.budget.recurringPayments[0].nextDueDate,
    ).toBe(apiDate("2030-02-04"));
  });

  it("refuses another user's budget", async () => {
    const owner = await createUserWithBudget();
    const other = await createUserWithBudget();

    const body = await startCycle(other.token, owner.budgetId, "2030-01-31", []);

    expect(errorCode(body)).toBe("FORBIDDEN");
  });

  it("refuses payments that aren't on the budget", async () => {
    const owner = await createUserWithBudget();
    const other = await createUserWithBudget();
    const theirs = await createPayment(
      other.token,
      other.budgetId,
      "Theirs",
      "2030-01-31",
    );

    const body = await startCycle(owner.token, owner.budgetId, "2030-01-31", [
      theirs.id,
    ]);

    expect(errorCode(body)).toBe("RECURRING_PAYMENT_NOT_FOUND");
  });

  describe("what happened to the payments", () => {
    const HISTORY = `mutation ($input: StartPaydayCycleInput!) {
      startPaydayCycle(input: $input) {
        budget {
          bankBalance
          recurringPayments { name nextDueDate debt { balance } thisCycle { kind dates } history { kind balanceChange open dates } }
          oneOffPayments { name paidAt }
        }
      }
    }`;
    const DAY = 24 * 60 * 60 * 1000;
    // A day relative to today, as YYYY-MM-DD, for payments that have to be due before today
    const day = (offset: number) => new Date(ukDay().getTime() + offset * DAY).toISOString().slice(0, 10);
    const start = (token: string, input: Record<string, unknown>) =>
      gql(HISTORY, { input: { bankBalance: 500, alreadyPaid: null, ...input } }, token);

    it("records a left-over payment as paid without changing the confirmed balance, but pays down a debt", async () => {
      const { token, budgetId } = await createUserWithBudget();
      const card = await createPayment(token, budgetId, "Card", "2030-01-10", {
        category: "CREDIT_CARD",
        debt: { balance: 1000, apr: 12, startingBalance: 1000 },
      });

      const body = await start(token, {
        budgetId,
        payday: "2030-02-01",
        leftOver: [{ recurringPaymentId: card.id, outcome: "PAID" }],
      });

      expect(body.errors).toBeUndefined();
      const { budget } = body.data.startPaydayCycle;
      expect(budget.bankBalance).toBe(500);
      // £10 of interest goes on first, then the £20 comes off
      expect(budget.recurringPayments[0]).toMatchObject({
        nextDueDate: apiDate("2030-02-10"),
        debt: { balance: 990 },
        thisCycle: [],
      });
      // Alongside the record of the balance being set when the debt was added
      expect(budget.recurringPayments[0].history).toContainEqual({
        kind: "PAID",
        balanceChange: 0,
        open: false,
        dates: [apiDate("2030-01-10")],
      });
    });

    it("records a left-over payment that didn't go out as skipped, and leaves one still to pay overdue", async () => {
      const { token, budgetId } = await createUserWithBudget();
      const gym = await createPayment(token, budgetId, "Gym", "2030-01-10");
      const phone = await createPayment(token, budgetId, "Phone", "2030-01-12");

      const body = await start(token, {
        budgetId,
        payday: "2030-02-01",
        leftOver: [
          { recurringPaymentId: gym.id, outcome: "SKIPPED" },
          { recurringPaymentId: phone.id, outcome: "DUE" },
        ],
      });

      const payments = byName(body.data.startPaydayCycle.budget.recurringPayments);
      expect(payments.Gym).toMatchObject({
        nextDueDate: apiDate("2030-02-10"),
        history: [{ kind: "SKIPPED", balanceChange: 0, open: false, dates: [apiDate("2030-01-10")] }],
      });
      expect(payments.Phone).toMatchObject({ nextDueDate: apiDate("2030-01-12"), history: [] });
    });

    it("records every left-over date of a weekly payment", async () => {
      const { token, budgetId } = await createUserWithBudget();
      const cleaner = await createPayment(token, budgetId, "Cleaner", "2030-01-14", { frequency: "WEEKLY" });

      const body = await start(token, {
        budgetId,
        payday: "2030-02-01",
        leftOver: [{ recurringPaymentId: cleaner.id, outcome: "PAID" }],
      });

      expect(body.data.startPaydayCycle.budget.recurringPayments[0]).toMatchObject({
        nextDueDate: apiDate("2030-02-04"),
        history: [{ kind: "PAID", dates: ["2030-01-14", "2030-01-21", "2030-01-28"].map(apiDate) }],
      });
    });

    it("records payments that already went out since payday as paid in the new cycle, so they can be undone", async () => {
      const { token, budgetId } = await createUserWithBudget();
      // Due yesterday and not yet marked paid
      const gym = await createPayment(token, budgetId, "Gym", day(-8), { frequency: "WEEKLY" });
      await mongoose.model("RecurringPayment").updateOne({ _id: gym.id }, { nextDueDate: new Date(day(-1)) });

      const body = await start(token, {
        budgetId,
        payday: day(-2),
        leftOver: [],
        alreadyPaid: { recurringPaymentIds: [gym.id], oneOffPaymentIds: [] },
      });

      expect(body.errors).toBeUndefined();
      const { budget } = body.data.startPaydayCycle;
      expect(budget.bankBalance).toBe(500);
      expect(budget.recurringPayments[0].thisCycle).toEqual([paid(day(-1))]);
      expect(budget.recurringPayments[0].history).toEqual([
        { kind: "PAID", balanceChange: 0, open: true, dates: [apiDate(day(-1))] },
      ]);

      // Undone, the balance stays put, as nothing came off it
      const undone = await markUnpaid(token, budgetId, [gym.id]);
      expect(undone.data.markPaymentsUnpaid.budget).toMatchObject({ bankBalance: 500 });
      expect(undone.data.markPaymentsUnpaid.budget.recurringPayments[0].nextDueDate).toBe(apiDate(day(-1)));
    });

    it("marks one-off payments that already went out as paid without changing the balance", async () => {
      const { token, budgetId } = await createUserWithBudget();
      const created = await gql(
        `mutation ($input: CreateOneOffPaymentInput!) { createOneOffPayment(input: $input) { oneOffPayment { id } } }`,
        { input: { budgetId, name: "Gift", amount: 30, dueDate: day(-1), type: "EXPENSE", category: "OTHER" } },
        token,
      );
      const gift = created.data.createOneOffPayment.oneOffPayment.id;

      const body = await start(token, {
        budgetId,
        payday: day(-2),
        leftOver: [],
        alreadyPaid: { recurringPaymentIds: [], oneOffPaymentIds: [gift] },
      });

      const { budget } = body.data.startPaydayCycle;
      expect(budget.bankBalance).toBe(500);
      expect(budget.oneOffPayments).toEqual([{ name: "Gift", paidAt: expect.any(String) }]);
    });

    it("refuses an unknown left-over outcome", async () => {
      const { token, budgetId } = await createUserWithBudget();
      const gym = await createPayment(token, budgetId, "Gym", "2030-01-10");

      const body = await start(token, {
        budgetId,
        payday: "2030-02-01",
        leftOver: [{ recurringPaymentId: gym.id, outcome: "MAYBE" }],
      });

      expect(body.errors).toBeDefined();
    });
  });
});

describe("marking payments paid", () => {
  const ONE_OFF = `mutation ($input: CreateOneOffPaymentInput!) {
    createOneOffPayment(input: $input) { oneOffPayment { id } }
  }`;

  const oneOff = async (
    token: string,
    budgetId: string,
    name: string,
    amount: number,
    type: string,
  ) =>
    (
      await gql(
        ONE_OFF,
        {
          input: {
            budgetId,
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
    const { token, budgetId } = await createUserWithBudget();
    const netflix = await createPayment(
      token,
      budgetId,
      "Netflix",
      "2030-01-31",
    );

    const body = await markPaid(token, budgetId, [netflix.id]);

    expect(body.errors).toBeUndefined();
    const { budget } = body.data.markPaymentsPaid;
    // The test budget starts with £1,000 and Netflix is £20
    expect(budget.bankBalance).toBe(980);
    expect(budget.recurringPayments).toEqual([
      expect.objectContaining({
        nextDueDate: apiDate("2030-02-28"),
        thisCycle: [paid("2030-01-31")],
      }),
    ]);
  });

  it("pays one date at a time, for a payment due more than once a cycle", async () => {
    const { token, budgetId } = await createUserWithBudget();
    const cleaner = await createPayment(
      token,
      budgetId,
      "Cleaner",
      "2030-01-07",
      { frequency: "WEEKLY" },
    );

    await markPaid(token, budgetId, [cleaner.id]);
    const body = await markPaid(token, budgetId, [cleaner.id]);

    const { budget } = body.data.markPaymentsPaid;
    expect(budget.bankBalance).toBe(960);
    expect(budget.recurringPayments[0]).toMatchObject({
      nextDueDate: apiDate("2030-01-21"),
      thisCycle: [paid("2030-01-07"), paid("2030-01-14")],
    });
  });

  it("has nothing to pay once a payment has ended", async () => {
    const { token, budgetId } = await createUserWithBudget();
    const ended = await createPayment(token, budgetId, "Old gym", "2020-01-15", {
      lastPaymentDate: "2020-03-15",
    });

    const body = await markPaid(token, budgetId, [ended.id]);

    const { budget } = body.data.markPaymentsPaid;
    expect(budget.bankBalance).toBe(1000);
    expect(budget.recurringPayments[0]).toMatchObject({
      nextDueDate: null,
      thisCycle: [],
    });
  });

  it("settles one-off payments, adding income, and keeps them marked paid until payday", async () => {
    const { token, budgetId } = await createUserWithBudget();
    const gift = await oneOff(token, budgetId, "Gift", 75.5, "EXPENSE");
    const refund = await oneOff(token, budgetId, "Refund", 10, "INCOME");
    const kept = await oneOff(token, budgetId, "Later", 5, "EXPENSE");

    const body = await gql(
      PAID,
      {
        input: {
          budgetId,
          recurringPaymentIds: [],
          oneOffPaymentIds: [gift, refund],
        },
      },
      token,
    );

    const { budget } = body.data.markPaymentsPaid;
    expect(budget.bankBalance).toBe(934.5);
    expect(budget.oneOffPayments).toEqual([
      { id: kept, paidAt: null },
      { id: refund, paidAt: expect.any(String) },
      { id: gift, paidAt: expect.any(String) },
    ]);
  });

  it("returns whatever is selected on the budget, notes included", async () => {
    const { token, budgetId } = await createUserWithBudget();
    await gql(
      `mutation ($input: CreateNoteInput!) { createNote(input: $input) { success } }`,
      { input: { budgetId, body: "Pay rent" } },
      token,
    );

    const body = await gql(
      `mutation ($input: MarkPaymentsPaidInput!) {
        markPaymentsPaid(input: $input) { budget { id notes { body } } }
      }`,
      { input: { budgetId, recurringPaymentIds: [], oneOffPaymentIds: [] } },
      token,
    );

    expect(body.errors).toBeUndefined();
    expect(body.data.markPaymentsPaid.budget).toEqual({
      id: budgetId,
      notes: [{ body: "Pay rent" }],
    });
  });

  it("refuses another user's budget", async () => {
    const owner = await createUserWithBudget();
    const other = await createUserWithBudget();

    const body = await gql(
      PAID,
      {
        input: {
          budgetId: owner.budgetId,
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
    const { token, budgetId } = await createUserWithBudget();
    const netflix = await createPayment(
      token,
      budgetId,
      "Netflix",
      "2030-01-31",
    );
    await markPaid(token, budgetId, [netflix.id]);

    const body = await markUnpaid(token, budgetId, [netflix.id]);

    const { budget } = body.data.markPaymentsUnpaid;
    expect(budget.bankBalance).toBe(1000);
    expect(budget.recurringPayments[0]).toMatchObject({
      nextDueDate: apiDate("2030-01-31"),
      thisCycle: [],
    });
  });

  it("undoes only the latest date paid", async () => {
    const { token, budgetId } = await createUserWithBudget();
    const cleaner = await createPayment(
      token,
      budgetId,
      "Cleaner",
      "2030-01-07",
      { frequency: "WEEKLY" },
    );
    await markPaid(token, budgetId, [cleaner.id]);
    await markPaid(token, budgetId, [cleaner.id]);

    const body = await markUnpaid(token, budgetId, [cleaner.id]);

    const { budget } = body.data.markPaymentsUnpaid;
    expect(budget.bankBalance).toBe(980);
    expect(budget.recurringPayments[0]).toMatchObject({
      nextDueDate: apiDate("2030-01-14"),
      thisCycle: [paid("2030-01-07")],
    });
  });

  it("brings a skipped date back without touching the balance", async () => {
    const { token, budgetId } = await createUserWithBudget();
    const netflix = await createPayment(
      token,
      budgetId,
      "Netflix",
      "2030-01-31",
    );
    await skip(token, budgetId, [netflix.id]);

    const body = await markUnpaid(token, budgetId, [netflix.id]);

    expect(body.errors).toBeUndefined();
    const { budget } = body.data.markPaymentsUnpaid;
    expect(budget.bankBalance).toBe(1000);
    expect(budget.recurringPayments[0]).toMatchObject({
      nextDueDate: apiDate("2030-01-31"),
      thisCycle: [],
    });
  });

  it("leaves a payment with nothing to undo alone", async () => {
    const { token, budgetId } = await createUserWithBudget();
    const netflix = await createPayment(
      token,
      budgetId,
      "Netflix",
      "2030-01-31",
    );

    const body = await markUnpaid(token, budgetId, [netflix.id]);

    const { budget } = body.data.markPaymentsUnpaid;
    expect(budget.bankBalance).toBe(1000);
    expect(budget.recurringPayments[0].nextDueDate).toBe(apiDate("2030-01-31"));
  });
});

describe("skipRecurringPayments", () => {
  it("skips the next date without touching the balance", async () => {
    const { token, budgetId } = await createUserWithBudget();
    const netflix = await createPayment(
      token,
      budgetId,
      "Netflix",
      "2030-01-31",
    );

    const body = await skip(token, budgetId, [netflix.id]);

    expect(body.errors).toBeUndefined();
    const { success, budget } = body.data.skipRecurringPayments;
    expect(success).toBe(true);
    expect(budget.bankBalance).toBe(1000);
    expect(budget.recurringPayments[0]).toMatchObject({
      nextDueDate: apiDate("2030-02-28"),
      thisCycle: [skipped("2030-01-31")],
    });
  });

  it("skips the date after one already paid", async () => {
    const { token, budgetId } = await createUserWithBudget();
    const netflix = await createPayment(
      token,
      budgetId,
      "Netflix",
      "2030-01-31",
    );
    await markPaid(token, budgetId, [netflix.id]);

    const body = await skip(token, budgetId, [netflix.id]);

    const { budget } = body.data.skipRecurringPayments;
    // Only the paid date's £20 has come off
    expect(budget.bankBalance).toBe(980);
    expect(budget.recurringPayments[0]).toMatchObject({
      nextDueDate: apiDate("2030-03-31"),
      thisCycle: [paid("2030-01-31"), skipped("2030-02-28")],
    });
  });

  it("skips every date before until at once, and brings them back together", async () => {
    const { token, budgetId } = await createUserWithBudget();
    const cleaner = await createPayment(
      token,
      budgetId,
      "Cleaner",
      "2030-01-07",
      { frequency: "WEEKLY" },
    );

    const body = await skip(token, budgetId, [cleaner.id], "2030-01-31");

    expect(body.data.skipRecurringPayments.budget.recurringPayments[0]).toMatchObject({
      nextDueDate: apiDate("2030-02-04"),
      thisCycle: [skipped("2030-01-07", "2030-01-14", "2030-01-21", "2030-01-28")],
    });

    const undone = await markUnpaid(token, budgetId, [cleaner.id]);
    expect(undone.data.markPaymentsUnpaid.budget.recurringPayments[0]).toMatchObject({
      nextDueDate: apiDate("2030-01-07"),
      thisCycle: [],
    });
  });

  it("skips nothing when the next date is from until on", async () => {
    const { token, budgetId } = await createUserWithBudget();
    const netflix = await createPayment(
      token,
      budgetId,
      "Netflix",
      "2030-01-31",
    );

    const body = await skip(token, budgetId, [netflix.id], "2030-01-31");

    expect(body.data.skipRecurringPayments.budget.recurringPayments[0]).toMatchObject({
      nextDueDate: apiDate("2030-01-31"),
      thisCycle: [],
    });
  });

  it("rejects an until that isn't a date", async () => {
    const { token, budgetId } = await createUserWithBudget();
    const netflix = await createPayment(
      token,
      budgetId,
      "Netflix",
      "2030-01-31",
    );

    const body = await skip(token, budgetId, [netflix.id], "next payday");

    expect(errorCode(body)).toBe("BAD_USER_INPUT");
  });

  it("refuses payments that aren't on the budget", async () => {
    const owner = await createUserWithBudget();
    const other = await createUserWithBudget();
    const theirs = await createPayment(
      other.token,
      other.budgetId,
      "Theirs",
      "2030-01-31",
    );

    const body = await skip(owner.token, owner.budgetId, [theirs.id]);

    expect(errorCode(body)).toBe("RECURRING_PAYMENT_NOT_FOUND");
  });

  it("refuses another user's budget", async () => {
    const owner = await createUserWithBudget();
    const other = await createUserWithBudget();
    const netflix = await createPayment(
      owner.token,
      owner.budgetId,
      "Netflix",
      "2030-01-31",
    );

    const body = await skip(other.token, owner.budgetId, [netflix.id]);

    expect(errorCode(body)).toBe("FORBIDDEN");
    const mine = await gql(
      `query { budget { recurringPayments { thisCycle { kind } } } }`,
      undefined,
      owner.token,
    );
    expect(mine.data.budget.recurringPayments).toEqual([{ thisCycle: [] }]);
  });

  it("requires authentication", async () => {
    const { budgetId } = await createUserWithBudget();
    const body = await gql(SKIP, {
      input: { budgetId, recurringPaymentIds: [] },
    });
    expect(errorCode(body)).toBe("UNAUTHENTICATED");
  });
});

import {
  setupTestApp,
  teardownTestApp,
  clearDatabase,
  gql,
  agent,
  errorCode,
  createUserWithAccount,
  type Variables
} from '../helpers';
import { addDays, occurrence, ukDay } from '../../utils/dates';

beforeAll(setupTestApp);
afterAll(teardownTestApp);
beforeEach(clearDatabase);

const FEED = `mutation ($input: UpdateCalendarFeedInput!) {
  updateCalendarFeed(input: $input) {
    account { calendarFeed { token payments paydays renewals notes debtFree showAmounts } }
  }
}`;
const RESET = `mutation ($accountId: ID!) { resetCalendarFeed(accountId: $accountId) { account { calendarFeed { token } } } }`;
const PAYMENT = `mutation ($input: CreateRecurringPaymentInput!) {
  createRecurringPayment(input: $input) { recurringPayment { id } }
}`;
const NOTE = `mutation ($input: CreateNoteInput!) { createNote(input: $input) { note { id } } }`;

const day = (offset: number) => addDays(ukDay(), offset).toISOString().slice(0, 10);
const compact = (offset: number) => day(offset).replace(/-/g, '');

const turnOn = async (token: string, accountId: string, extra: Variables = {}) => {
  const body = await gql(FEED, { input: { accountId, enabled: true, ...extra } }, token);
  expect(body.errors).toBeUndefined();
  return body.data.updateCalendarFeed.account.calendarFeed.token as string;
};

const fetchFeed = (feedToken: string) => agent().get(`/cal/${feedToken}.ics`);

const addPayment = (token: string, accountId: string, extra: Variables) =>
  gql(
    PAYMENT,
    {
      input: {
        accountId,
        amount: 120,
        category: 'UTILITIES',
        frequency: 'MONTHLY',
        type: 'EXPENSE',
        ...extra
      }
    },
    token
  );

// The VEVENT whose summary starts with the title, unfolded
const eventFor = (calendar: string, title: string) => {
  const unfolded = calendar.replace(/\r\n /g, '');
  return unfolded.split('BEGIN:VEVENT').find(event => event.includes(`SUMMARY:${title}`));
};

describe('the calendar feed settings', () => {
  it('starts off, carrying everything but debt-free dates, without amounts', async () => {
    const { token } = await createUserWithAccount();
    const body = await gql(
      `query { account { calendarFeed { token payments paydays renewals notes debtFree showAmounts } } }`,
      {},
      token
    );
    expect(body.data.account.calendarFeed).toEqual({
      token: null,
      payments: true,
      paydays: true,
      renewals: true,
      notes: true,
      debtFree: false,
      showAmounts: false
    });
  });

  it('gets an address when turned on, keeps it on later changes, and loses it when off', async () => {
    const { token, accountId } = await createUserWithAccount();
    const feedToken = await turnOn(token, accountId);
    expect(feedToken).toMatch(/^[A-Za-z0-9_-]{32}$/);

    const changed = await gql(FEED, { input: { accountId, debtFree: true, showAmounts: true } }, token);
    expect(changed.data.updateCalendarFeed.account.calendarFeed).toMatchObject({
      token: feedToken,
      debtFree: true,
      showAmounts: true
    });

    const off = await gql(FEED, { input: { accountId, enabled: false } }, token);
    expect(off.data.updateCalendarFeed.account.calendarFeed.token).toBeNull();
    expect((await fetchFeed(feedToken)).status).toBe(404);
  });

  it('gives a new address on reset, and the old one stops working', async () => {
    const { token, accountId } = await createUserWithAccount();
    const first = await turnOn(token, accountId);
    const body = await gql(RESET, { accountId }, token);
    const second = body.data.resetCalendarFeed.account.calendarFeed.token;

    expect(second).not.toBe(first);
    expect((await fetchFeed(first)).status).toBe(404);
    expect((await fetchFeed(second)).status).toBe(200);
  });

  it("refuses someone else's account", async () => {
    const owner = await createUserWithAccount();
    const other = await createUserWithAccount();
    const body = await gql(FEED, { input: { accountId: owner.accountId, enabled: true } }, other.token);
    expect(errorCode(body)).toBe('FORBIDDEN');
  });
});

describe('GET /cal/:token.ics', () => {
  it('answers an address that is not a feed with not found', async () => {
    expect((await agent().get('/cal/nothing-here-at-all-really.ics')).status).toBe(404);
    expect((await agent().get('/cal/short.ics')).status).toBe(404);
  });

  it('is a calendar of the payments, with a reminder the usual day before at 8:00', async () => {
    const { token, accountId } = await createUserWithAccount();
    await addPayment(token, accountId, { name: 'Energy', firstPaymentDate: day(5) });
    const feedToken = await turnOn(token, accountId);

    const res = await fetchFeed(feedToken);

    expect(res.status).toBe(200);
    expect(res.headers['content-type']).toMatch(/^text\/calendar/);
    expect(res.headers['cache-control']).toBe('private, no-store');
    expect(res.text.startsWith('BEGIN:VCALENDAR\r\n')).toBe(true);
    const energy = eventFor(res.text, 'Energy due');
    expect(energy).toContain(`DTSTART;VALUE=DATE:${compact(5)}`);
    expect(energy).toContain(`DTEND;VALUE=DATE:${compact(6)}`);
    expect(energy).toContain('TRIGGER:-PT16H');
    // No amounts unless asked
    expect(energy).not.toContain('£');
    // A year of monthly payments
    expect(res.text.match(/SUMMARY:Energy due/g)).toHaveLength(12);
  });

  it('carries one-off payments still to pay, with their own timing', async () => {
    const { token, accountId } = await createUserWithAccount();
    await gql(
      `mutation ($input: CreateOneOffPaymentInput!) { createOneOffPayment(input: $input) { success } }`,
      {
        input: {
          accountId,
          name: 'Birthday',
          amount: 75,
          dueDate: day(9),
          type: 'EXPENSE',
          category: 'GIFT',
          dueReminder: { off: false, days: 7 }
        }
      },
      token
    );
    const feedToken = await turnOn(token, accountId);

    const birthday = eventFor((await fetchFeed(feedToken)).text, 'Birthday due');
    expect(birthday).toContain(`DTSTART;VALUE=DATE:${compact(9)}`);
    expect(birthday).toContain('TRIGGER:-PT160H');
  });

  it("uses a payment's own timing, and none when it's off", async () => {
    const { token, accountId } = await createUserWithAccount();
    await addPayment(token, accountId, {
      name: 'Rent',
      firstPaymentDate: day(3),
      dueReminder: { off: false, days: 3 }
    });
    await addPayment(token, accountId, { name: 'Gym', firstPaymentDate: day(4), dueReminder: { off: true } });
    const feedToken = await turnOn(token, accountId);

    const res = await fetchFeed(feedToken);

    expect(eventFor(res.text, 'Rent due')).toContain('TRIGGER:-PT64H');
    expect(eventFor(res.text, 'Gym due')).not.toContain('BEGIN:VALARM');
  });

  it('shows amounts in titles when asked', async () => {
    const { token, accountId } = await createUserWithAccount();
    await addPayment(token, accountId, { name: 'Energy', firstPaymentDate: day(5) });
    const feedToken = await turnOn(token, accountId, { showAmounts: true });

    expect(eventFor((await fetchFeed(feedToken)).text, 'Energy due · £120.00')).toBeDefined();
  });

  it('carries renewals, a yearly payment as its renewal, paydays and dated notes', async () => {
    const { token, accountId } = await createUserWithAccount();
    await addPayment(token, accountId, { name: 'Phone', firstPaymentDate: day(-20), renewalDate: day(40) });
    await addPayment(token, accountId, {
      name: 'Car insurance',
      frequency: 'ANNUALLY',
      firstPaymentDate: day(36),
      renewalReminder: { off: false, days: 7 }
    });
    await gql(NOTE, { input: { accountId, body: 'Car MOT and service', date: day(20), remind: [14, 0] } }, token);
    const feedToken = await turnOn(token, accountId);

    const { text } = await fetchFeed(feedToken);

    expect(eventFor(text, 'Phone renews')).toContain(`DTSTART;VALUE=DATE:${compact(40)}`);
    // The usual month before
    expect(eventFor(text, 'Phone renews')).toContain('TRIGGER:-PT712H');
    const insurance = eventFor(text, 'Car insurance renews');
    expect(insurance).toContain(`DTSTART;VALUE=DATE:${compact(36)}`);
    // Its renewal reminder a week before, and its payment reminder the day before
    expect(insurance).toContain('TRIGGER:-PT160H');
    expect(insurance).toContain('TRIGGER:-PT16H');
    const mot = eventFor(text, 'Car MOT and service');
    expect(mot).toContain(`DTSTART;VALUE=DATE:${compact(20)}`);
    expect(mot).toContain('TRIGGER:-PT328H');
    expect(mot).toContain('TRIGGER:PT8H');
    // The default payday is the last working day of each month
    expect(text.match(/SUMMARY:Payday/g)?.length).toBeGreaterThanOrEqual(12);
  });

  it('leaves out what it was told to, and adds debt-free dates when asked', async () => {
    const { token, accountId } = await createUserWithAccount();
    await addPayment(token, accountId, {
      name: 'Loan',
      amount: 100,
      firstPaymentDate: day(2),
      debt: { balance: 250, apr: 0 }
    });
    await gql(NOTE, { input: { accountId, body: 'Dated', date: day(10) } }, token);
    const feedToken = await turnOn(token, accountId, {
      payments: false,
      paydays: false,
      notes: false,
      debtFree: true
    });

    const { text } = await fetchFeed(feedToken);

    expect(text).not.toContain('SUMMARY:Loan due');
    expect(text).not.toContain('SUMMARY:Payday');
    expect(text).not.toContain('SUMMARY:Dated');
    // £250 at £100 a month clears on the third payment
    const paidOff = eventFor(text, 'Loan paid off');
    const third = occurrence(addDays(ukDay(), 2), 'MONTHLY', 2);
    expect(paidOff).toContain(`DTSTART;VALUE=DATE:${third.toISOString().slice(0, 10).replace(/-/g, '')}`);
  });
});

import mongoose from 'mongoose';
import { setupTestApp, teardownTestApp, clearDatabase, gql, errorCode, createUserWithBudget } from '../../helpers';
import { addDays, ukDay } from '../../../utils/dates';

beforeAll(setupTestApp);
afterAll(teardownTestApp);
beforeEach(clearDatabase);

const SETTINGS = `mutation ($input: UpdateReminderSettingsInput!) {
  updateReminderSettings(input: $input) { success budget { reminderSettings { paymentDays renewalDays payday } } }
}`;
const UPDATE = `mutation ($input: UpdateRemindersInput!) {
  updateReminders(input: $input) { success states { key read cleared snoozedUntil } }
}`;
const STATES = `query { budget { reminderStates { key read cleared snoozedUntil } } }`;

const day = (offset: number) => addDays(ukDay(), offset).toISOString().slice(0, 10);
const apiDay = (offset: number) => String(addDays(ukDay(), offset).getTime());

describe('reminder settings', () => {
  it('starts with a day before payments, a month before renewals and payday on', async () => {
    const { token } = await createUserWithBudget();
    const body = await gql(`query { budget { reminderSettings { paymentDays renewalDays payday } } }`, {}, token);
    expect(body.data.budget.reminderSettings).toEqual({ paymentDays: 1, renewalDays: 30, payday: true });
  });

  it('changes only what it is given', async () => {
    const { token, budgetId } = await createUserWithBudget();
    const body = await gql(SETTINGS, { input: { budgetId, renewalDays: 14 } }, token);
    expect(body.errors).toBeUndefined();
    expect(body.data.updateReminderSettings.budget.reminderSettings).toEqual({
      paymentDays: 1,
      renewalDays: 14,
      payday: true
    });

    const again = await gql(SETTINGS, { input: { budgetId, paymentDays: 3, payday: false } }, token);
    expect(again.data.updateReminderSettings.budget.reminderSettings).toEqual({
      paymentDays: 3,
      renewalDays: 14,
      payday: false
    });
  });

  it.each([
    ['payment days that are not a choice', { paymentDays: 2 }],
    ['renewal days that are not a choice', { renewalDays: 1 }]
  ])('rejects %s', async (_, extra) => {
    const { token, budgetId } = await createUserWithBudget();
    const body = await gql(SETTINGS, { input: { budgetId, ...extra } }, token);
    expect(errorCode(body)).toBe('BAD_USER_INPUT');
  });

  it("refuses someone else's budget", async () => {
    const owner = await createUserWithBudget();
    const other = await createUserWithBudget();
    const body = await gql(SETTINGS, { input: { budgetId: owner.budgetId, paymentDays: 0 } }, other.token);
    expect(errorCode(body)).toBe('FORBIDDEN');
  });
});

describe('updateReminders', () => {
  const KEY = 'due:507f1f77bcf86cd799439011:2030-01-01';

  it('has nothing until a reminder is dealt with', async () => {
    const { token } = await createUserWithBudget();
    const body = await gql(STATES, {}, token);
    expect(body.data.budget.reminderStates).toEqual([]);
  });

  it('marks reminders read', async () => {
    const { token, budgetId } = await createUserWithBudget();
    const body = await gql(UPDATE, { input: { budgetId, keys: [KEY, 'payday:2030-01-31'], action: 'READ' } }, token);
    expect(body.errors).toBeUndefined();
    expect(body.data.updateReminders.states).toHaveLength(2);

    const read = await gql(STATES, {}, token);
    expect(read.data.budget.reminderStates).toEqual(
      expect.arrayContaining([
        { key: KEY, read: true, cleared: false, snoozedUntil: null },
        { key: 'payday:2030-01-31', read: true, cleared: false, snoozedUntil: null }
      ])
    );
  });

  it('clears a reminder and brings it back just as it was, still new', async () => {
    const { token, budgetId } = await createUserWithBudget();
    const cleared = await gql(UPDATE, { input: { budgetId, keys: [KEY], action: 'CLEAR' } }, token);
    expect(cleared.data.updateReminders.states).toEqual([
      { key: KEY, read: false, cleared: true, snoozedUntil: null }
    ]);

    const restored = await gql(UPDATE, { input: { budgetId, keys: [KEY], action: 'RESTORE' } }, token);
    expect(restored.data.updateReminders.states).toEqual([
      { key: KEY, read: false, cleared: false, snoozedUntil: null }
    ]);
  });

  it('puts a reminder away until a day, when it is new again', async () => {
    const { token, budgetId } = await createUserWithBudget();
    await gql(UPDATE, { input: { budgetId, keys: [KEY], action: 'READ' } }, token);
    const later = await gql(UPDATE, { input: { budgetId, keys: [KEY], action: 'LATER', until: day(3) } }, token);
    expect(later.errors).toBeUndefined();
    expect(later.data.updateReminders.states).toEqual([
      { key: KEY, read: false, cleared: false, snoozedUntil: apiDay(3) }
    ]);
  });

  it.each([
    ['no day', undefined],
    ['today', 0],
    ['a day gone by', -2],
    ['more than a year away', 400]
  ])('refuses Later with %s', async (_, offset) => {
    const { token, budgetId } = await createUserWithBudget();
    const until = offset === undefined ? undefined : day(offset);
    const body = await gql(UPDATE, { input: { budgetId, keys: [KEY], action: 'LATER', until } }, token);
    expect(errorCode(body)).toBe('BAD_USER_INPUT');
  });

  it.each([
    ['no keys', []],
    ['a key that is not a reminder', ['not a key']],
    ['too many keys', Array.from({ length: 201 }, (_, i) => `payday:${i}`)]
  ])('refuses %s', async (_, keys) => {
    const { token, budgetId } = await createUserWithBudget();
    const body = await gql(UPDATE, { input: { budgetId, keys, action: 'READ' } }, token);
    expect(errorCode(body)).toBe('BAD_USER_INPUT');
  });

  it('keeps each budget to its own reminders', async () => {
    const a = await createUserWithBudget();
    const b = await createUserWithBudget();
    await gql(UPDATE, { input: { budgetId: a.budgetId, keys: [KEY], action: 'CLEAR' } }, a.token);

    const forbidden = await gql(UPDATE, { input: { budgetId: a.budgetId, keys: [KEY], action: 'READ' } }, b.token);
    expect(errorCode(forbidden)).toBe('FORBIDDEN');
    expect((await gql(STATES, {}, b.token)).data.budget.reminderStates).toEqual([]);
  });

  it('forgets reminders nobody has touched for over a year', async () => {
    const { token, budgetId } = await createUserWithBudget();
    await gql(UPDATE, { input: { budgetId, keys: [KEY], action: 'CLEAR' } }, token);
    await mongoose
      .model('ReminderState')
      .collection.updateOne({ key: KEY }, { $set: { updatedAt: new Date(Date.now() - 500 * 86_400_000) } });

    expect((await gql(STATES, {}, token)).data.budget.reminderStates).toEqual([]);
    await gql(UPDATE, { input: { budgetId, keys: ['payday:2030-01-31'], action: 'READ' } }, token);
    expect(await mongoose.model('ReminderState').countDocuments({ key: KEY })).toBe(0);
  });

  it('goes with the budget when the user is deleted', async () => {
    const { token, budgetId } = await createUserWithBudget();
    await gql(UPDATE, { input: { budgetId, keys: [KEY], action: 'CLEAR' } }, token);
    const deleted = await gql(`mutation { deleteCurrentUser { success } }`, {}, token);
    expect(deleted.errors).toBeUndefined();
    expect(await mongoose.model('ReminderState').countDocuments({})).toBe(0);
  });
});

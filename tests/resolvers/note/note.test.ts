import mongoose from 'mongoose';
import {
  setupTestApp,
  teardownTestApp,
  clearDatabase,
  gql,
  errorCode,
  createUserWithBudget
} from '../../helpers';

beforeAll(setupTestApp);
afterAll(teardownTestApp);
beforeEach(clearDatabase);

const FIELDS = 'id budget body createdAt updatedAt';
const CREATE = `mutation ($input: CreateNoteInput!) { createNote(input: $input) { success note { ${FIELDS} } } }`;
const UNKNOWN = '507f1f77bcf86cd799439011';

const makeNote = (token: string | undefined, budgetId: string, body: string) =>
  gql(CREATE, { input: { budgetId, body } }, token);

describe('createNote', () => {
  it('creates a note and adds it to the budget', async () => {
    const { token, budgetId } = await createUserWithBudget();
    const body = await makeNote(token, budgetId, 'Buy milk');
    expect(body.errors).toBeUndefined();
    const { success, note } = body.data.createNote;
    expect(success).toBe(true);
    expect(note).toMatchObject({ budget: budgetId, body: 'Buy milk' });
    // Timestamps are Dates serialized through GraphQL String, i.e. epoch milliseconds
    expect(note.createdAt).toMatch(/^\d{13}$/);
    expect(note.updatedAt).toMatch(/^\d{13}$/);
    const budget = await mongoose.model('Budget').findById(budgetId).populate('notes');
    expect(budget.notes.map((r: { id: string }) => r.id)).toEqual([note.id]);
  });

  it('rejects a duplicate body in the same budget', async () => {
    const { token, budgetId } = await createUserWithBudget();
    await makeNote(token, budgetId, 'Same');
    const body = await makeNote(token, budgetId, 'Same');
    expect(errorCode(body)).toBe('NOTE_EXISTS');
  });

  it('allows the same body in a different budget', async () => {
    const a = await createUserWithBudget();
    const b = await createUserWithBudget();
    await makeNote(a.token, a.budgetId, 'Same');
    const body = await makeNote(b.token, b.budgetId, 'Same');
    expect(body.errors).toBeUndefined();
  });

  it('returns FORBIDDEN for another users budget', async () => {
    const owner = await createUserWithBudget();
    const other = await createUserWithBudget();
    const body = await makeNote(other.token, owner.budgetId, 'Sneaky');
    expect(errorCode(body)).toBe('FORBIDDEN');
  });

  it('requires authentication', async () => {
    const { budgetId } = await createUserWithBudget();
    const body = await makeNote(undefined, budgetId, 'x');
    expect(errorCode(body)).toBe('UNAUTHENTICATED');
  });
});

describe('reading notes', () => {
  it("lists them on the user's budget", async () => {
    const { token, budgetId } = await createUserWithBudget();
    await makeNote(token, budgetId, 'one');
    await makeNote(token, budgetId, 'two');
    const body = await gql(`query { budget { notes { ${FIELDS} } } }`, undefined, token);
    expect(body.errors).toBeUndefined();
    const { notes } = body.data.budget;
    expect(notes.map((n: { body: string }) => n.body).sort()).toEqual(['one', 'two']);
    expect(notes[0].budget).toBe(budgetId);
  });
});

describe('updateNote', () => {
  const UPDATE = `mutation ($id: ID!, $input: UpdateNoteInput!) {
    updateNote(id: $id, input: $input) { success note { id body } }
  }`;

  it('updates the body', async () => {
    const { token, budgetId } = await createUserWithBudget();
    const created = await makeNote(token, budgetId, 'old');
    const body = await gql(
      UPDATE,
      { id: created.data.createNote.note.id, input: { body: 'new' } },
      token
    );
    expect(body.errors).toBeUndefined();
    expect(body.data.updateNote.note.body).toBe('new');
  });

  it('returns NOTE_NOT_FOUND for an unknown id', async () => {
    const { token } = await createUserWithBudget();
    const body = await gql(UPDATE, { id: UNKNOWN, input: { body: 'x' } }, token);
    expect(errorCode(body)).toBe('NOTE_NOT_FOUND');
  });

  it('returns FORBIDDEN for another users note', async () => {
    const owner = await createUserWithBudget();
    const other = await createUserWithBudget();
    const created = await makeNote(owner.token, owner.budgetId, 'private');
    const body = await gql(
      UPDATE,
      { id: created.data.createNote.note.id, input: { body: 'x' } },
      other.token
    );
    expect(errorCode(body)).toBe('FORBIDDEN');
  });
});

describe('deleteNote', () => {
  const DELETE = `mutation ($id: ID!) { deleteNote(id: $id) { success deletedCount ids } }`;

  it('deletes the note and removes it from the budget', async () => {
    const { token, budgetId } = await createUserWithBudget();
    const created = await makeNote(token, budgetId, 'gone');
    const id = created.data.createNote.note.id;
    const body = await gql(DELETE, { id }, token);
    expect(body.errors).toBeUndefined();
    expect(body.data.deleteNote).toEqual({ success: true, deletedCount: 1, ids: [id] });
    expect(await mongoose.model('Note').countDocuments()).toBe(0);
    const budget = await mongoose.model('Budget').findById(budgetId).populate('notes');
    expect(budget.notes).toHaveLength(0);
  });

  it('returns NOTE_NOT_FOUND for an unknown id', async () => {
    const { token } = await createUserWithBudget();
    const body = await gql(DELETE, { id: UNKNOWN }, token);
    expect(errorCode(body)).toBe('NOTE_NOT_FOUND');
  });

  it('returns FORBIDDEN for another users note', async () => {
    const owner = await createUserWithBudget();
    const other = await createUserWithBudget();
    const created = await makeNote(owner.token, owner.budgetId, 'private');
    const body = await gql(DELETE, { id: created.data.createNote.note.id }, other.token);
    expect(errorCode(body)).toBe('FORBIDDEN');
    expect(await mongoose.model('Note').countDocuments()).toBe(1);
  });
});

describe('note colours', () => {
  const CREATE_WITH_COLOUR = `mutation ($input: CreateNoteInput!) { createNote(input: $input) { note { id color } } }`;
  const UPDATE = `mutation ($id: ID!, $input: UpdateNoteInput!) { updateNote(id: $id, input: $input) { note { color body } } }`;

  it('defaults to blue and can be changed', async () => {
    const { token, budgetId } = await createUserWithBudget();
    const created = await gql(CREATE_WITH_COLOUR, { input: { budgetId, body: 'Hi' } }, token);
    const { id, color } = created.data.createNote.note;
    expect(color).toBe('BLUE');

    const updated = await gql(UPDATE, { id, input: { color: 'ROSE' } }, token);

    expect(updated.data.updateNote.note).toEqual({ color: 'ROSE', body: 'Hi' });
  });
});

describe('note dates', () => {
  const DATED = 'id date remind repeat payment';
  const CREATE_DATED = `mutation ($input: CreateNoteInput!) { createNote(input: $input) { note { ${DATED} } } }`;
  const UPDATE_DATED = `mutation ($id: ID!, $input: UpdateNoteInput!) { updateNote(id: $id, input: $input) { note { ${DATED} } } }`;
  const PAYMENT = `mutation ($input: CreateRecurringPaymentInput!) {
    createRecurringPayment(input: $input) { recurringPayment { id } }
  }`;

  const makePayment = async (token: string, budgetId: string) => {
    const body = await gql(
      PAYMENT,
      {
        input: {
          budgetId,
          name: 'Car insurance',
          amount: 612,
          category: 'FINANCES',
          frequency: 'ANNUALLY',
          type: 'EXPENSE',
          firstPaymentDate: '2030-11-07'
        }
      },
      token
    );
    return body.data.createRecurringPayment.recurringPayment.id as string;
  };

  it('has no date, reminders or payment unless given', async () => {
    const { token, budgetId } = await createUserWithBudget();
    const body = await gql(CREATE_DATED, { input: { budgetId, body: 'Plain' } }, token);
    expect(body.data.createNote.note).toMatchObject({ date: null, remind: [], repeat: 'NONE', payment: null });
  });

  it('saves a date, its reminders, a yearly repeat and a payment', async () => {
    const { token, budgetId } = await createUserWithBudget();
    const payment = await makePayment(token, budgetId);
    const body = await gql(
      CREATE_DATED,
      {
        input: {
          budgetId,
          body: 'Car insurance quotes',
          date: '2030-11-07',
          remind: [30, 7],
          repeat: 'YEARLY',
          payment
        }
      },
      token
    );
    expect(body.errors).toBeUndefined();
    expect(body.data.createNote.note).toMatchObject({
      date: String(Date.parse('2030-11-07T00:00:00Z')),
      remind: [30, 7],
      repeat: 'YEARLY',
      payment
    });
  });

  it('takes the date and payment off with null', async () => {
    const { token, budgetId } = await createUserWithBudget();
    const payment = await makePayment(token, budgetId);
    const created = await gql(
      CREATE_DATED,
      { input: { budgetId, body: 'MOT', date: '2030-10-22', remind: [14], payment } },
      token
    );
    const { id } = created.data.createNote.note;

    const body = await gql(UPDATE_DATED, { id, input: { date: null, payment: null, remind: [] } }, token);
    expect(body.errors).toBeUndefined();
    expect(body.data.updateNote.note).toMatchObject({ date: null, payment: null, remind: [] });
  });

  it.each([
    ['a date that does not exist', { date: '2030-02-30' }],
    ['a reminder that is not a choice', { remind: [3] }],
    ['the same reminder twice', { remind: [7, 7] }]
  ])('rejects %s', async (_, extra) => {
    const { token, budgetId } = await createUserWithBudget();
    const body = await gql(CREATE_DATED, { input: { budgetId, body: 'Bad', ...extra } }, token);
    expect(errorCode(body)).toBe('BAD_USER_INPUT');
  });

  it("won't link a payment on another budget", async () => {
    const owner = await createUserWithBudget();
    const other = await createUserWithBudget();
    const payment = await makePayment(other.token, other.budgetId);
    const body = await gql(
      CREATE_DATED,
      { input: { budgetId: owner.budgetId, body: 'Sneaky', payment } },
      owner.token
    );
    expect(errorCode(body)).toBe('BAD_USER_INPUT');
    expect(body.errors?.[0].extensions?.field).toBe('payment');
  });

  it('stays when its payment is deleted, no longer linked', async () => {
    const { token, budgetId } = await createUserWithBudget();
    const payment = await makePayment(token, budgetId);
    const created = await gql(CREATE_DATED, { input: { budgetId, body: 'Quotes', payment } }, token);

    await gql(`mutation ($ids: [ID!]!) { batchDeleteRecurringPayments(ids: $ids) { success } }`, { ids: [payment] }, token);

    const note = await mongoose.model('Note').findById(created.data.createNote.note.id);
    expect(note.payment).toBeNull();
  });

  it('repeats every month, 3 months or 6 months as well as every year', async () => {
    const { token, budgetId } = await createUserWithBudget();
    const body = await gql(
      CREATE_DATED,
      { input: { budgetId, body: 'Prescription', date: '2030-10-01', remind: [7], repeat: 'BIANNUALLY' } },
      token
    );
    expect(body.errors).toBeUndefined();
    expect(body.data.createNote.note.repeat).toBe('BIANNUALLY');
  });

  it("only repeats with a payment once it's linked to one", async () => {
    const { token, budgetId } = await createUserWithBudget();
    const unlinked = await gql(
      CREATE_DATED,
      { input: { budgetId, body: 'Nothing to follow', repeat: 'WITH_PAYMENT' } },
      token
    );
    expect(errorCode(unlinked)).toBe('BAD_USER_INPUT');

    const payment = await makePayment(token, budgetId);
    const linked = await gql(
      CREATE_DATED,
      { input: { budgetId, body: 'Follows it', repeat: 'WITH_PAYMENT', remind: [14], payment } },
      token
    );
    expect(linked.errors).toBeUndefined();

    // Unlinking it while it still follows the payment isn't allowed
    const unlink = await gql(
      UPDATE_DATED,
      { id: linked.data.createNote.note.id, input: { payment: null } },
      token
    );
    expect(errorCode(unlink)).toBe('BAD_USER_INPUT');
  });

  it("keeps the payment's next date, once, when a payment it follows is deleted", async () => {
    const { token, budgetId } = await createUserWithBudget();
    const payment = await makePayment(token, budgetId);
    const created = await gql(
      CREATE_DATED,
      { input: { budgetId, body: 'Quotes', repeat: 'WITH_PAYMENT', remind: [30], payment } },
      token
    );

    await gql(`mutation ($ids: [ID!]!) { batchDeleteRecurringPayments(ids: $ids) { success } }`, { ids: [payment] }, token);

    const note = await mongoose.model('Note').findById(created.data.createNote.note.id);
    expect(note).toMatchObject({ repeat: 'NONE', payment: null, remind: [30] });
    expect(note.date.toISOString().slice(0, 10)).toBe('2030-11-07');
  });
});

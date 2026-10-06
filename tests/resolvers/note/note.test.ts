import mongoose from 'mongoose';
import {
  setupTestApp,
  teardownTestApp,
  clearDatabase,
  gql,
  errorCode,
  createUserWithAccount
} from '../../helpers';

beforeAll(setupTestApp);
afterAll(teardownTestApp);
beforeEach(clearDatabase);

const FIELDS = 'id account body createdAt updatedAt';
const CREATE = `mutation ($input: CreateNoteInput!) { createNote(input: $input) { success note { ${FIELDS} } } }`;
const UNKNOWN = '507f1f77bcf86cd799439011';

const makeNote = (token: string | undefined, accountId: string, body: string) =>
  gql(CREATE, { input: { accountId, body } }, token);

describe('createNote', () => {
  it('creates a note and adds it to the account', async () => {
    const { token, accountId } = await createUserWithAccount();
    const body = await makeNote(token, accountId, 'Buy milk');
    expect(body.errors).toBeUndefined();
    const { success, note } = body.data.createNote;
    expect(success).toBe(true);
    expect(note).toMatchObject({ account: accountId, body: 'Buy milk' });
    // Timestamps are Dates serialized through GraphQL String, i.e. epoch milliseconds
    expect(note.createdAt).toMatch(/^\d{13}$/);
    expect(note.updatedAt).toMatch(/^\d{13}$/);
    const account = await mongoose.model('Account').findById(accountId).populate('notes');
    expect(account.notes.map((r: { id: string }) => r.id)).toEqual([note.id]);
  });

  it('rejects a duplicate body in the same account', async () => {
    const { token, accountId } = await createUserWithAccount();
    await makeNote(token, accountId, 'Same');
    const body = await makeNote(token, accountId, 'Same');
    expect(errorCode(body)).toBe('NOTE_EXISTS');
  });

  it('allows the same body in a different account', async () => {
    const a = await createUserWithAccount();
    const b = await createUserWithAccount();
    await makeNote(a.token, a.accountId, 'Same');
    const body = await makeNote(b.token, b.accountId, 'Same');
    expect(body.errors).toBeUndefined();
  });

  it('returns FORBIDDEN for another users account', async () => {
    const owner = await createUserWithAccount();
    const other = await createUserWithAccount();
    const body = await makeNote(other.token, owner.accountId, 'Sneaky');
    expect(errorCode(body)).toBe('FORBIDDEN');
  });

  it('requires authentication', async () => {
    const { accountId } = await createUserWithAccount();
    const body = await makeNote(undefined, accountId, 'x');
    expect(errorCode(body)).toBe('UNAUTHENTICATED');
  });
});

describe('reading notes', () => {
  it("lists them on the user's account", async () => {
    const { token, accountId } = await createUserWithAccount();
    await makeNote(token, accountId, 'one');
    await makeNote(token, accountId, 'two');
    const body = await gql(`query { account { notes { ${FIELDS} } } }`, undefined, token);
    expect(body.errors).toBeUndefined();
    const { notes } = body.data.account;
    expect(notes.map((n: { body: string }) => n.body).sort()).toEqual(['one', 'two']);
    expect(notes[0].account).toBe(accountId);
  });
});

describe('updateNote', () => {
  const UPDATE = `mutation ($id: ID!, $input: UpdateNoteInput!) {
    updateNote(id: $id, input: $input) { success note { id body } }
  }`;

  it('updates the body', async () => {
    const { token, accountId } = await createUserWithAccount();
    const created = await makeNote(token, accountId, 'old');
    const body = await gql(
      UPDATE,
      { id: created.data.createNote.note.id, input: { body: 'new' } },
      token
    );
    expect(body.errors).toBeUndefined();
    expect(body.data.updateNote.note.body).toBe('new');
  });

  it('returns NOTE_NOT_FOUND for an unknown id', async () => {
    const { token } = await createUserWithAccount();
    const body = await gql(UPDATE, { id: UNKNOWN, input: { body: 'x' } }, token);
    expect(errorCode(body)).toBe('NOTE_NOT_FOUND');
  });

  it('returns FORBIDDEN for another users note', async () => {
    const owner = await createUserWithAccount();
    const other = await createUserWithAccount();
    const created = await makeNote(owner.token, owner.accountId, 'private');
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

  it('deletes the note and removes it from the account', async () => {
    const { token, accountId } = await createUserWithAccount();
    const created = await makeNote(token, accountId, 'gone');
    const id = created.data.createNote.note.id;
    const body = await gql(DELETE, { id }, token);
    expect(body.errors).toBeUndefined();
    expect(body.data.deleteNote).toEqual({ success: true, deletedCount: 1, ids: [id] });
    expect(await mongoose.model('Note').countDocuments()).toBe(0);
    const account = await mongoose.model('Account').findById(accountId).populate('notes');
    expect(account.notes).toHaveLength(0);
  });

  it('returns NOTE_NOT_FOUND for an unknown id', async () => {
    const { token } = await createUserWithAccount();
    const body = await gql(DELETE, { id: UNKNOWN }, token);
    expect(errorCode(body)).toBe('NOTE_NOT_FOUND');
  });

  it('returns FORBIDDEN for another users note', async () => {
    const owner = await createUserWithAccount();
    const other = await createUserWithAccount();
    const created = await makeNote(owner.token, owner.accountId, 'private');
    const body = await gql(DELETE, { id: created.data.createNote.note.id }, other.token);
    expect(errorCode(body)).toBe('FORBIDDEN');
    expect(await mongoose.model('Note').countDocuments()).toBe(1);
  });
});

describe('note colours', () => {
  const CREATE_WITH_COLOUR = `mutation ($input: CreateNoteInput!) { createNote(input: $input) { note { id color } } }`;
  const UPDATE = `mutation ($id: ID!, $input: UpdateNoteInput!) { updateNote(id: $id, input: $input) { note { color body } } }`;

  it('defaults to blue and can be changed', async () => {
    const { token, accountId } = await createUserWithAccount();
    const created = await gql(CREATE_WITH_COLOUR, { input: { accountId, body: 'Hi' } }, token);
    const { id, color } = created.data.createNote.note;
    expect(color).toBe('BLUE');

    const updated = await gql(UPDATE, { id, input: { color: 'ROSE' } }, token);

    expect(updated.data.updateNote.note).toEqual({ color: 'ROSE', body: 'Hi' });
  });
});

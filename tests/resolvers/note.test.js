import mongoose from 'mongoose';
import {
  setupTestApp,
  teardownTestApp,
  clearDatabase,
  gql,
  errorCode,
  createUserWithAccount
} from '../helpers';

beforeAll(setupTestApp);
afterAll(teardownTestApp);
beforeEach(clearDatabase);

const FIELDS = 'id account body createdAt updatedAt';
const CREATE = `mutation ($note: NoteInput!) { createNote(note: $note) { success note { ${FIELDS} } } }`;
const UNKNOWN = '507f1f77bcf86cd799439011';

const makeNote = (token, accountId, body) =>
  gql(CREATE, { note: { account: accountId, body } }, token);

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
    const account = await mongoose.model('Account').findById(accountId);
    expect(account.notes.map(String)).toEqual([note.id]);
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

describe('note queries', () => {
  it('lists notes for an account', async () => {
    const { token, accountId } = await createUserWithAccount();
    await makeNote(token, accountId, 'one');
    await makeNote(token, accountId, 'two');
    const body = await gql(
      `query ($id: ID!) { notes(accountId: $id) { body } }`,
      { id: accountId },
      token
    );
    expect(body.errors).toBeUndefined();
    expect(body.data.notes.map(n => n.body).sort()).toEqual(['one', 'two']);
  });

  it('returns NOTES_NOT_FOUND when there are none', async () => {
    const { token, accountId } = await createUserWithAccount();
    const body = await gql(
      `query ($id: ID!) { notes(accountId: $id) { body } }`,
      { id: accountId },
      token
    );
    expect(errorCode(body)).toBe('NOTES_NOT_FOUND');
  });

  it('finds a note by id', async () => {
    const { token, accountId } = await createUserWithAccount();
    const created = await makeNote(token, accountId, 'hello');
    const body = await gql(
      `query ($id: ID) { note(id: $id) { ${FIELDS} } }`,
      { id: created.data.createNote.note.id },
      token
    );
    expect(body.data.note.body).toBe('hello');
  });

  it('returns NOTE_NOT_FOUND for an unknown id', async () => {
    const { token } = await createUserWithAccount();
    const body = await gql(`query ($id: ID) { note(id: $id) { id } }`, { id: UNKNOWN }, token);
    expect(errorCode(body)).toBe('NOTE_NOT_FOUND');
  });

  it('returns FORBIDDEN for another users note', async () => {
    const owner = await createUserWithAccount();
    const other = await createUserWithAccount();
    const created = await makeNote(owner.token, owner.accountId, 'private');
    const body = await gql(
      `query ($id: ID) { note(id: $id) { id } }`,
      { id: created.data.createNote.note.id },
      other.token
    );
    expect(errorCode(body)).toBe('FORBIDDEN');
  });
});

describe('editNote', () => {
  const EDIT = `mutation ($id: ID!, $note: NoteInput!) {
    editNote(id: $id, note: $note) { success note { id body } }
  }`;

  it('updates the body', async () => {
    const { token, accountId } = await createUserWithAccount();
    const created = await makeNote(token, accountId, 'old');
    const body = await gql(
      EDIT,
      { id: created.data.createNote.note.id, note: { body: 'new' } },
      token
    );
    expect(body.errors).toBeUndefined();
    expect(body.data.editNote.note.body).toBe('new');
  });

  it('returns NOTE_NOT_FOUND for an unknown id', async () => {
    const { token } = await createUserWithAccount();
    const body = await gql(EDIT, { id: UNKNOWN, note: { body: 'x' } }, token);
    expect(errorCode(body)).toBe('NOTE_NOT_FOUND');
  });

  it('returns FORBIDDEN for another users note', async () => {
    const owner = await createUserWithAccount();
    const other = await createUserWithAccount();
    const created = await makeNote(owner.token, owner.accountId, 'private');
    const body = await gql(
      EDIT,
      { id: created.data.createNote.note.id, note: { body: 'x' } },
      other.token
    );
    expect(errorCode(body)).toBe('FORBIDDEN');
  });
});

describe('deleteNote', () => {
  const DELETE = `mutation ($id: ID!) { deleteNote(id: $id) { success note { id body } } }`;

  it('deletes the note and removes it from the account', async () => {
    const { token, accountId } = await createUserWithAccount();
    const created = await makeNote(token, accountId, 'gone');
    const id = created.data.createNote.note.id;
    const body = await gql(DELETE, { id }, token);
    expect(body.errors).toBeUndefined();
    expect(body.data.deleteNote).toMatchObject({ success: true, note: { id, body: 'gone' } });
    expect(await mongoose.model('Note').countDocuments()).toBe(0);
    const account = await mongoose.model('Account').findById(accountId);
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
  });
});

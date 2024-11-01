import { checkAuth, checkAccountAccess } from '../middleware/isAuth';
import { Account } from '../models/Account';
import { Note } from '../models/Note';

const findNotes = async (_, { accountId }, req) => {
  await checkAuth(req);
  await checkAccountAccess(accountId, req);

  // Fetch the account associated with the authenticated user
  const userAccount = await Account.findOne({ _id: accountId });

  if (!userAccount) {
    throw new Error(`No account exists for user with ID '${accountId}'`);
  }

  const notes = await Note.find({ account: accountId });

  if (!notes || notes.length === 0) {
    throw new Error(`No notes exist for account with ID '${accountId}'`);
  }

  return notes;
};

const findNote = async (_, { id }, req) => {
  await checkAuth(req);
  const note = await Note.findById(id);
  if (!note) {
    throw new Error(`Note with ID '${id}' does not exist`);
  }
  await checkAccountAccess(note.account, req);
  return note;
};

const createNote = async (_, { note }, req) => {
  await checkAuth(req);
  await checkAccountAccess(note.account, req);

  // Check account exists first
  const account = await Account.findOne({ _id: note.account });
  if (!account) {
    throw new Error(`Account with ID '${note.account}' does not exist`);
  }

  const existingNote = await Note.findOne({ body: note.body, account: note.account });
  if (existingNote) {
    throw new Error('Note with this content already exists');
  }

  const newNote = new Note(note);
  await newNote.save();

  // Update account's notes array
  account.notes.push(newNote);
  await account.save();

  return { note: newNote, success: true };
};

const editNote = async (_, { id, note }, req) => {
  await checkAuth(req);
  const currentNote = await Note.findById(id);
  if (!currentNote) {
    throw new Error(`Note with id '${id}' does not exist`);
  }
  await checkAccountAccess(currentNote.account, req);

  const mergedNote = Object.assign(currentNote, note);
  mergedNote.__v = mergedNote.__v + 1;

  const editedNote = await Note.findOneAndUpdate({ _id: id }, mergedNote, {
    new: true
  });

  if (!editedNote) {
    throw new Error('Note cannot be updated');
  }

  return {
    note: editedNote,
    success: true
  };
};

const deleteNote = async (_, { id }, req) => {
  await checkAuth(req);
  const note = await Note.findById(id);
  if (!note) {
    throw new Error(`Note with id '${id}' does not exist`);
  }
  await checkAccountAccess(note.account, req);

  try {
    // Remove note reference from account
    const account = await Account.findOne({ notes: note._id });
    if (account) {
      account.notes.pull(note._id);
      await account.save();
    }

    const response = await Note.deleteOne({ _id: id });
    if (note && response.deletedCount === 1) {
      return {
        note,
        success: true
      };
    } else {
      throw new Error('Note cannot be deleted');
    }
  } catch (err) {
    throw err;
  }
};

exports.resolvers = {
  Query: {
    notes: findNotes,
    note: findNote
  },
  Mutation: {
    createNote,
    editNote,
    deleteNote
  }
};

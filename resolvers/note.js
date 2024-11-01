import { checkAuth, checkAccountAccess } from '../middleware/isAuth';
import { Account } from '../models/Account';
import { Note } from '../models/Note';

const findNotes = async (_, _1, req) => {
  await checkAuth(req);
  const notes = await Note.find({ account: req.accountId });
  if (!notes) {
    throw new Error(`No notes currently exist`);
  }
  return notes;
};

const findNote = async (_, { id }, req) => {
  await checkAuth(req);
  const note = await Note.findById(id);
  if (!note) {
    throw new Error(`Note with id '${id}' does not exist`);
  }
  await checkAccountAccess(note.account, req);
  return note;
};

const createNote = async (_, { note }, req) => {
  await checkAuth(req);
  await checkAccountAccess(note.account, req);
  try {
    const existingNote = await Note.findOne({ body: note.body, account: note.account });
    if (existingNote) {
      throw new Error(`Note already exists`);
    }

    const newNote = new Note(note);
    await newNote.save();

    // UPDATE ACCOUNT TO NOTE ONE-TO-MANY LIST
    if (newNote.account) {
      const account = await Account.findOne({ _id: newNote.account });

      if (account) {
        account.notes.push(newNote);
        account.save();
      } else {
        throw new Error(`Account with ID ${newNote.account} could not be found`);
      }
    }

    if (newNote) {
      return { note: newNote, success: true };
    } else {
      throw new Error(`Note could not be created`);
    }
  } catch (err) {
    throw err;
  }
};

const editNote = async (_, { id, note }, req) => {
  await checkAuth(req);
  const currentNote = await Note.findById(id);
  if (!currentNote) {
    throw new Error(`Note with id '${id}' does not exist`);
  }
  await checkAccountAccess(currentNote.account, req);

  try {
    const mergedNote = Object.assign(currentNote, note);
    mergedNote.__v = mergedNote.__v + 1;

    const editedNote = await Note.findOneAndUpdate({ _id: id }, mergedNote, {
      new: true
    });

    if (editedNote) {
      return {
        note: editedNote,
        success: true
      };
    } else {
      throw new Error('Note cannot be updated');
    }
  } catch (err) {
    throw err;
  }
};

const deleteNote = async (_, { id }, req) => {
  await checkAuth(req);
  const note = await Note.findById(id);
  if (!note) {
    throw new Error(`Note with id '${id}' does not exist`);
  }
  await checkAccountAccess(note.account, req);

  try {
    const response = await Note.deleteOne({ _id: id });
    if (note && response.deletedCount == 1) {
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

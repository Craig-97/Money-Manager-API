import type { Request } from 'express';
import type { CreateNoteInput, NoteInput } from '../types/note';
import { checkAuth, checkAccountAccess } from '../middleware/isAuth';
import { Account } from '../models/Account';
import { Note } from '../models/Note';
import {
  ACCOUNT_NOT_FOUND,
  NOTES_NOT_FOUND,
  NOTE_NOT_FOUND,
  NOTE_UPDATE_FAILED,
  NOTE_DELETE_FAILED,
  NOTE_EXISTS,
  incrementVersion
} from '../utils';

const findNotes = async (_: unknown, { accountId }: { accountId: string }, req: Request) => {
  await checkAuth(req);
  await checkAccountAccess(accountId, req);

  // Fetch the account associated with the authenticated user
  const userAccount = await Account.findOne({ _id: accountId });

  if (!userAccount) {
    throw ACCOUNT_NOT_FOUND(accountId);
  }

  const notes = await Note.find({ account: accountId });

  if (!notes || notes.length === 0) {
    throw NOTES_NOT_FOUND(accountId);
  }

  return notes;
};

const findNote = async (_: unknown, { id }: { id: string }, req: Request) => {
  await checkAuth(req);
  const note = await Note.findById(id);
  if (!note) {
    throw NOTE_NOT_FOUND(id);
  }
  await checkAccountAccess(note.account, req);
  return note;
};

const createNote = async (_: unknown, { note }: { note: CreateNoteInput }, req: Request) => {
  await checkAuth(req);
  await checkAccountAccess(note.account, req);

  // Check account exists first
  const account = await Account.findOne({ _id: note.account });
  if (!account) {
    throw ACCOUNT_NOT_FOUND(note.account);
  }

  const existingNote = await Note.findOne({ body: note.body, account: note.account });
  if (existingNote) {
    throw NOTE_EXISTS(note.body);
  }

  const newNote = new Note(note);
  await newNote.save();

  // Update account's notes array
  account.notes.push(newNote);
  await account.save();

  return { note: newNote, success: true };
};

const editNote = async (_: unknown, { id, note }: { id: string; note: NoteInput }, req: Request) => {
  await checkAuth(req);
  const currentNote = await Note.findById(id);
  if (!currentNote) {
    throw NOTE_NOT_FOUND(id);
  }
  await checkAccountAccess(currentNote.account, req);

  const mergedNote = incrementVersion(Object.assign(currentNote, note));

  const editedNote = await Note.findOneAndUpdate({ _id: id }, mergedNote, {
    new: true
  });

  if (!editedNote) {
    throw NOTE_UPDATE_FAILED();
  }

  return {
    note: editedNote,
    success: true
  };
};

const deleteNote = async (_: unknown, { id }: { id: string }, req: Request) => {
  await checkAuth(req);
  const note = await Note.findById(id);
  if (!note) {
    throw NOTE_NOT_FOUND(id);
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
      throw NOTE_DELETE_FAILED();
    }
  } catch (err) {
    throw err;
  }
};

export const resolvers = {
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

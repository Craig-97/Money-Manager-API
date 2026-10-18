import type { Request } from 'express';
import { isValidObjectId, type Types } from 'mongoose';
import type { CreateNoteInput, UpdateNoteInput } from '../../types/note/noteTypes';
import { checkAuth, checkAccountAccess } from '../../middleware/isAuth';
import { Note } from '../../models/note/Note';
import { RecurringPayment } from '../../models/payment/RecurringPayment';
import {
  NOTE_NOT_FOUND,
  NOTE_PAYMENT_NOT_FOUND,
  NOTE_UPDATE_FAILED,
  NOTE_DELETE_FAILED,
  NOTE_EXISTS,
  incrementVersion,
  parseInput,
  newNote,
  noteInput
} from '../../utils';

// A note can only be about a payment on its own account
const checkNotePayment = async (payment: string | null | undefined, account: Types.ObjectId | string) => {
  if (!payment) return;
  if (!isValidObjectId(payment) || !(await RecurringPayment.exists({ _id: payment, account }))) {
    throw NOTE_PAYMENT_NOT_FOUND(payment);
  }
};

const createNote = async (_: unknown, { input }: { input: CreateNoteInput }, req: Request) => {
  checkAuth(req);
  const { accountId, ...note } = parseInput(newNote, input);
  await checkAccountAccess(accountId, req);

  await checkNotePayment(note.payment, accountId);

  const existingNote = await Note.findOne({ body: note.body, account: accountId });
  if (existingNote) {
    throw NOTE_EXISTS(note.body);
  }

  const createdNote = await new Note({ ...note, account: accountId }).save();

  return { note: createdNote, success: true };
};

const updateNote = async (_: unknown, { id, input }: { id: string; input: UpdateNoteInput }, req: Request) => {
  checkAuth(req);
  const currentNote = await Note.findById(id);
  if (!currentNote) {
    throw NOTE_NOT_FOUND(id);
  }
  await checkAccountAccess(currentNote.account, req);
  input = parseInput(noteInput, input);
  await checkNotePayment(input.payment, currentNote.account);

  const mergedNote = incrementVersion(Object.assign(currentNote, input));

  const updatedNote = await Note.findOneAndUpdate({ _id: id }, mergedNote, {
    new: true
  });

  if (!updatedNote) {
    throw NOTE_UPDATE_FAILED();
  }

  return { note: updatedNote, success: true };
};

const deleteNote = async (_: unknown, { id }: { id: string }, req: Request) => {
  checkAuth(req);
  const note = await Note.findById(id);
  if (!note) {
    throw NOTE_NOT_FOUND(id);
  }

  await checkAccountAccess(note.account, req);

  const response = await Note.deleteOne({ _id: id });
  if (response.deletedCount !== 1) {
    throw NOTE_DELETE_FAILED();
  }

  return { success: true, deletedCount: 1, ids: [id] };
};

export const noteResolvers = {
  Mutation: {
    createNote,
    updateNote,
    deleteNote
  }
};

import { Note } from '../models/Note';
import { Account } from '../models/Account';

const findNotes = async () => {
  const notes = Note.find();
  if (!notes) {
    throw new Error(`No notes currently exist`);
  }
  return notes;
};

const findNote = async (_, { id }) => {
  const note = await Note.findById(id);
  if (!note) {
    throw new Error(`Note with id: ${id} does not exist`);
  }
  return note;
};

const createNote = async (_, { note }) => {
  try {
    const existingNote = await Note.findOne({ body: note.body });
    if (existingNote) {
      throw new Error(`Note with body: ${note.body} already exists`);
    }

    const newNote = new Note(note);
    await newNote.save().then(() => {
      // UPDATE ACCOUNT TO NOTE ONE-TO-MANY LIST
      if (newNote.account) {
        Account.findOne({ _id: newNote.account }, (err, account) => {
          if (err) {
            throw err;
          }

          account.notes.push(newNote);
          account.save();
        });
      }
    });

    if (newNote) {
      return { note: newNote, success: true };
    } else {
      throw new Error(`Note could not be created`);
    }
  } catch (err) {
    throw err;
  }
};

const editNote = async (_, { id, note }) => {
  try {
    const currentNote = await Note.findById(id);
    if (!currentNote) {
      throw new Error(`Note with id: ${id} does not exist`);
    }

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

const deleteNote = async (_, { id }) => {
  try {
    const note = await Note.findById(id);
    if (!note) {
      throw new Error(`Note with id: ${id} does not exist`);
    }

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

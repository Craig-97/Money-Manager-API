import { Note } from '../models/Note';
import { Account } from '../models/Account';

const createNote = async (_, { note }) => {
  try {
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
      return { success: false };
    }
  } catch (err) {
    throw err;
  }
};

const editNote = async (_, { id, note }) => {
  const currentNote = await Note.findById(id);
  if (!currentNote) {
    return {
      success: false
    };
  }

  const mergedNote = Object.assign(currentNote, note);
  mergedNote.__v = mergedNote.__v + 1;

  try {
    const editedNote = await Note.findOneAndUpdate({ _id: id }, mergedNote, {
      new: true
    });

    if (editedNote) {
      return {
        note: editedNote,
        success: true
      };
    } else {
      return {
        success: false
      };
    }
  } catch (err) {
    throw err;
  }
};

const deleteNote = async (_, { id }) => {
  try {
    const note = await Note.findById(id);
    const response = await Note.deleteOne({ _id: id });
    if (response.ok && response.deletedCount == 1) {
      return {
        note,
        success: true
      };
    } else {
      return {
        note,
        success: false
      };
    }
  } catch (err) {
    throw err;
  }
};

exports.resolvers = {
  Query: {
    notes: () => Note.find(),
    note: (_, { id }) => Note.findById(id)
  },
  Mutation: {
    createNote,
    editNote,
    deleteNote
  }
};

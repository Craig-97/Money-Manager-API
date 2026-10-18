import mongoose, { Schema, Types } from 'mongoose';
import { NoteColor } from '../../constants/note/noteColor';
import { NoteRepeat } from '../../constants/note/noteRepeat';
import { enumValues } from '../../utils/helpers/enumHelpers';

export interface Note {
  body?: string;
  color: NoteColor;
  account: Types.ObjectId;
  // A day the note is about, e.g. an MOT, as midnight UTC like payment dates
  date?: Date | null;
  // Days before the date to remind, e.g. [30, 7]; only used with a date
  remind: number[];
  // Whether the date comes round every year
  repeat: NoteRepeat;
  // The recurring payment it's about, e.g. the car insurance it compares quotes for
  payment?: Types.ObjectId | null;
  createdAt: Date;
  updatedAt: Date;
}

const noteSchema = new Schema<Note>(
  {
    body: String,
    color: {
      type: String,
      enum: enumValues(NoteColor),
      default: NoteColor.BLUE
    },
    account: {
      type: Schema.Types.ObjectId,
      ref: 'Account',
      required: [true, 'Account ID required']
    },
    date: { type: Date, default: null },
    remind: { type: [Number], default: [] },
    repeat: { type: String, enum: enumValues(NoteRepeat), default: NoteRepeat.NONE },
    payment: { type: Schema.Types.ObjectId, ref: 'RecurringPayment', default: null }
  },
  { timestamps: true }
);

// Used to ensure unique note content within an account
// Also speeds up duplicate content checks during creation
noteSchema.index({ body: 1, account: 1 }, { unique: true });

// Used for quick lookups during edit/delete operations
// Also helps with auth checks that need both ID and account
noteSchema.index({ _id: 1, account: 1 });

// Used for finding all notes belonging to an account
// Helps with account population
noteSchema.index({ account: 1 });

export const Note = mongoose.model<Note>('Note', noteSchema);

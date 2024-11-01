import mongoose from 'mongoose';
const Schema = mongoose.Schema;

const noteSchema = mongoose.Schema(
  {
    body: String,
    account: {
      type: Schema.Types.ObjectId,
      ref: 'Account',
      required: 'Account ID required'
    }
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

export const Note = mongoose.model('Note', noteSchema);

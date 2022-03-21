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

export const Note = mongoose.model('Note', noteSchema);

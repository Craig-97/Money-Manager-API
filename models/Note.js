import mongoose from 'mongoose';
const Schema = mongoose.Schema;

export const Note = mongoose.model('Note', {
  title: String,
  body: String,
  account: {
    type: Schema.Types.ObjectId,
    ref: 'Account',
    required: 'Account ID required'
  }
});

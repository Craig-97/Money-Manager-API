import mongoose from 'mongoose';
const Schema = mongoose.Schema;

export const User = mongoose.model('User', {
  firstName: String,
  surname: String,
  email: {
    type: String,
    required: true
  },
  password: {
    type: String,
    required: true
  },
  account: {
    type: Schema.Types.ObjectId,
    ref: 'Account'
  }
});

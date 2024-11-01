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

// Used for login authentication - quickly find user by email
User.schema.index({ email: 1 }, { unique: true });

// Used for token-based authentication - quickly find user by ID
// Also used when linking accounts to users
User.schema.index({ _id: 1 });

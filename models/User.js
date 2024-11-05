import mongoose from 'mongoose';
const Schema = mongoose.Schema;

const UserSchema = new Schema({
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

// Add indexes to the schema
UserSchema.index({ email: 1 }, { unique: true }); // For login authentication

// Create and export the model using the schema
export const User = mongoose.model('User', UserSchema);

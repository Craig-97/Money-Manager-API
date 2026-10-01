import mongoose, { Schema, Types } from 'mongoose';

export interface User {
  firstName?: string;
  surname?: string;
  email: string;
  password: string;
  account?: Types.ObjectId;
}

const UserSchema = new Schema<User>({
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
export const User = mongoose.model<User>('User', UserSchema);

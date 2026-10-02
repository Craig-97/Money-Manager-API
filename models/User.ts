import mongoose, { Schema, Types, type HydratedDocument } from 'mongoose';

export interface User {
  firstName?: string;
  surname?: string;
  email: string;
  password: string;
  account?: Types.ObjectId;
  // Only a hash of the emailed reset token is stored, so a leaked database can't be used to reset passwords
  passwordResetTokenHash?: string;
  passwordResetExpires?: Date;
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
  },
  passwordResetTokenHash: String,
  passwordResetExpires: Date
});

// Add indexes to the schema
UserSchema.index({ email: 1 }, { unique: true }); // For login authentication
UserSchema.index({ passwordResetTokenHash: 1 }, { sparse: true }); // For looking up a reset link's user

// Create and export the model using the schema
export const User = mongoose.model<User>('User', UserSchema);

export type UserDocument = HydratedDocument<User>;

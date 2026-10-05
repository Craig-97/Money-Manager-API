import mongoose, { Schema, Types, type HydratedDocument } from 'mongoose';
import { ThemePreference } from '../constants/themePreference';

export interface User {
  firstName?: string;
  surname?: string;
  email: string;
  password: string;
  account?: Types.ObjectId;
  // Only a hash of the emailed reset token is stored, so a leaked database can't be used to reset passwords
  passwordResetTokenHash?: string;
  passwordResetExpires?: Date;
  // One per signed-in device; only a hash of the token held in that device's cookie is stored
  refreshTokens?: { hash: string; expires: Date }[];
  // Access tokens carry the version they were issued under. Raising it cancels every token already
  // issued, which is how signing out everywhere takes effect straight away.
  tokenVersion?: number;
  // Not chosen yet when unset, so a new device keeps whatever it already shows
  theme?: ThemePreference;
  accent?: string;
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
  passwordResetExpires: Date,
  refreshTokens: {
    type: [{ _id: false, hash: { type: String, required: true }, expires: { type: Date, required: true } }],
    default: []
  },
  tokenVersion: { type: Number, default: 0 },
  theme: { type: String, enum: Object.values(ThemePreference) },
  accent: String
});

// Add indexes to the schema
UserSchema.index({ email: 1 }, { unique: true }); // For login authentication
UserSchema.index({ passwordResetTokenHash: 1 }, { sparse: true }); // For looking up a reset link's user
UserSchema.index({ 'refreshTokens.hash': 1 }); // For looking up the user a refresh cookie belongs to

// Create and export the model using the schema
export const User = mongoose.model<User>('User', UserSchema);

export type UserDocument = HydratedDocument<User>;

import type { Request } from 'express';
import type { UserDetailsInput, UserInput } from '../types/user';
import crypto from 'crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { checkAuth } from '../middleware/isAuth';
import { Account } from '../models/Account';
import { User, type UserDocument } from '../models/User';
import { Bill } from '../models/Bill';
import { Note } from '../models/Note';
import { OneOffPayment } from '../models/OneOffPayment';
import { Payday } from '../models/Payday';
import {
  USER_NOT_FOUND,
  USERS_NOT_FOUND,
  USER_EMAIL_NOT_FOUND,
  USER_EXISTS,
  USER_UPDATE_FAILED,
  USER_DELETE_FAILED,
  INVALID_CREDENTIALS,
  ACCOUNT_NOT_FOUND,
  PASSWORD_RESET_TOKEN_INVALID,
  withTransaction,
  incrementVersion,
  validatePassword,
  sendPasswordResetEmail
} from '../utils';

const PASSWORD_RESET_EXPIRY_MINUTES = 60;

// Reset tokens are stored hashed, so lookups hash the token from the link the same way
const hashResetToken = (token: string) => crypto.createHash('sha256').update(token).digest('hex');

const createAuthData = (user: UserDocument) => {
  const token = jwt.sign({ userId: user.id, email: user.email }, process.env.JWT_KEY as string, {
    expiresIn: '1h'
  });

  return { user, token: token, tokenExpiration: 1 };
};

const findUsers = async () => {
  const users = User.find();
  if (!users) {
    throw USERS_NOT_FOUND();
  }
  return users;
};

const findUser = async (_: unknown, { id }: { id: string }) => {
  const user = await User.findById(id);
  if (!user) {
    throw USER_NOT_FOUND(id);
  }
  return user;
};

const login = async (_: unknown, { email, password }: { email: string; password: string }) => {
  const user = await User.findOne({ email: email });
  if (!user) {
    throw USER_EMAIL_NOT_FOUND();
  }
  const isEqual = await bcrypt.compare(password, user.password);
  if (!isEqual) {
    throw INVALID_CREDENTIALS();
  }
  return createAuthData(user);
};

const tokenFindUser = async (_: unknown, _1: unknown, req: Request) => {
  checkAuth(req);
  return findUser(_, { id: req.userId as string });
};

const registerAndLogin = async (_: unknown, { user }: { user: UserInput }) => {
  await createUser(_, { user });
  return login(_, { email: user.email, password: user.password });
};

const createUser = async (_: unknown, { user }: { user: UserInput }) => {
  try {
    const existingUser = await User.findOne({ email: user.email });
    if (existingUser) {
      throw USER_EXISTS();
    }
    const hashedPassword = await bcrypt.hash(user.password, 12);

    const newUser = new User({
      firstName: user.firstName,
      surname: user.surname,
      email: user.email,
      password: hashedPassword,
      account: user.account
    });
    await newUser.save();

    // UPDATE ACCOUNT USER FIELD
    if (newUser.account) {
      const account = await Account.findOne({ _id: newUser.account });
      if (account) {
        account.user = newUser._id;
        await account.save();
      } else {
        throw ACCOUNT_NOT_FOUND(newUser.account);
      }
    }

    return { user: newUser, success: true };
  } catch (err) {
    throw err;
  }
};

// Always succeeds so the response doesn't reveal whether an account exists for the email
const requestPasswordReset = async (_: unknown, { email }: { email: string }) => {
  const user = await User.findOne({ email: email });
  if (!user) {
    return { success: true };
  }

  // Requesting again replaces the previous token, so only the latest emailed link works
  const token = crypto.randomBytes(32).toString('hex');
  user.passwordResetTokenHash = hashResetToken(token);
  user.passwordResetExpires = new Date(Date.now() + PASSWORD_RESET_EXPIRY_MINUTES * 60 * 1000);
  await user.save();

  await sendPasswordResetEmail({
    to: user.email,
    firstName: user.firstName,
    token,
    expiresInMinutes: PASSWORD_RESET_EXPIRY_MINUTES
  });

  return { success: true };
};

const findUserByResetToken = (token: string) =>
  User.findOne({
    passwordResetTokenHash: hashResetToken(token),
    passwordResetExpires: { $gt: new Date() }
  });

// Lets the reset page show an expired link before the user types a new password
const passwordResetTokenValid = async (_: unknown, { token }: { token: string }) =>
  Boolean(await findUserByResetToken(token));

// Sets the new password, uses up the token and signs the user in
const resetPassword = async (_: unknown, { token, password }: { token: string; password: string }) => {
  const user = await findUserByResetToken(token);
  if (!user) {
    throw PASSWORD_RESET_TOKEN_INVALID();
  }

  validatePassword(password);

  user.password = await bcrypt.hash(password, 12);
  user.passwordResetTokenHash = undefined;
  user.passwordResetExpires = undefined;
  await user.save();

  return createAuthData(user);
};

const editUser = async (_: unknown, { id, user }: { id: string; user: UserInput }, req: Request) => {
  checkAuth(req);

  const currentUser = await User.findById(id);
  if (!currentUser) {
    throw USER_NOT_FOUND(id);
  }

  if (user.password) {
    const hashedPassword = await bcrypt.hash(user.password, 12);
    user.password = hashedPassword;
  }

  const mergedUser = incrementVersion(Object.assign(currentUser, user));

  const editedUser = await User.findOneAndUpdate({ _id: id }, mergedUser, {
    new: true
  });

  if (!editedUser) {
    throw USER_UPDATE_FAILED();
  }

  return {
    user: editedUser,
    success: true
  };
};

// Acts on the user the token belongs to, so nobody can change someone else's details
const updateCurrentUser = async (_: unknown, { input }: { input: UserDetailsInput }, req: Request) => {
  checkAuth(req);
  const user = await findUser(_, { id: req.userId as string });

  const email = input.email.trim();
  const taken = await User.findOne({ email, _id: { $ne: user._id } });
  if (taken) {
    throw USER_EXISTS();
  }

  user.firstName = input.firstName.trim();
  user.surname = input.surname.trim();
  user.email = email;
  incrementVersion(user);
  await user.save();

  return { user, success: true };
};

const changePassword = async (
  _: unknown,
  { currentPassword, newPassword }: { currentPassword: string; newPassword: string },
  req: Request
) => {
  checkAuth(req);
  const user = await findUser(_, { id: req.userId as string });

  const isEqual = await bcrypt.compare(currentPassword, user.password);
  if (!isEqual) {
    throw INVALID_CREDENTIALS();
  }
  validatePassword(newPassword);

  user.password = await bcrypt.hash(newPassword, 12);
  incrementVersion(user);
  await user.save();

  return { user, success: true };
};

const deleteUser = async (_: unknown, { id }: { id: string }, req: Request) => {
  checkAuth(req);

  return withTransaction(async session => {
    const user = await User.findById(id).populate('account').session(session);
    if (!user) {
      throw USER_NOT_FOUND(id);
    }

    if (user.account) {
      const account = await Account.findById(user.account._id)
        .populate('bills')
        .populate('notes')
        .populate('oneOffPayments')
        .populate('payday')
        .session(session);

      if (!account) {
        throw ACCOUNT_NOT_FOUND(user.account._id);
      }

      if (account.bills?.length > 0) {
        await Bill.deleteMany({
          _id: { $in: account.bills.map(bill => bill._id) }
        }).session(session);
      }

      if (account.notes?.length > 0) {
        await Note.deleteMany({
          _id: { $in: account.notes.map(note => note._id) }
        }).session(session);
      }

      if (account.oneOffPayments?.length > 0) {
        await OneOffPayment.deleteMany({
          _id: { $in: account.oneOffPayments.map(payment => payment._id) }
        }).session(session);
      }

      if (account.payday) {
        await Payday.deleteOne({ _id: account.payday._id }).session(session);
      }

      await Account.deleteOne({ _id: account._id }).session(session);
    }

    const response = await User.deleteOne({ _id: id }).session(session);
    if (response.deletedCount !== 1) {
      throw USER_DELETE_FAILED();
    }

    return { success: true };
  });
};

// Deletes the signed-in user and everything on their account. Unlike deleteUser it takes no id,
// so it can only ever remove the caller.
const deleteCurrentUser = async (_: unknown, _1: unknown, req: Request) => {
  checkAuth(req);
  return deleteUser(_, { id: req.userId as string }, req);
};

export const resolvers = {
  Query: {
    users: findUsers,
    user: findUser,
    login,
    tokenFindUser,
    passwordResetTokenValid
  },
  Mutation: {
    registerAndLogin,
    requestPasswordReset,
    resetPassword,
    createUser,
    editUser,
    deleteUser,
    updateCurrentUser,
    changePassword,
    deleteCurrentUser
  }
};

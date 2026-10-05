import type { Request, Response } from "express";
import type { UserDetailsInput, UserInput } from "../types/user";
import crypto from "crypto";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { ThemePreference } from "../constants/themePreference";
import { checkAuth } from "../middleware/isAuth";
import { Account } from "../models/Account";
import { User, type UserDocument } from "../models/User";
import { Bill } from "../models/Bill";
import { Note } from "../models/Note";
import { OneOffPayment } from "../models/OneOffPayment";
import { Payday } from "../models/Payday";
import { RecurringPayment } from "../models/RecurringPayment";
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
  REFRESH_TOKEN_INVALID,
  INVALID_ACCENT,
  MAX_REFRESH_TOKENS,
  createRefreshToken,
  hashRefreshToken,
  readRefreshCookie,
  setRefreshCookie,
  clearRefreshCookie,
  withTransaction,
  incrementVersion,
  validatePassword,
  sendPasswordResetEmail,
} from "../utils";

const PASSWORD_RESET_EXPIRY_MINUTES = 60;

// Reset tokens are stored hashed, so lookups hash the token from the link the same way
const hashResetToken = (token: string) =>
  crypto.createHash("sha256").update(token).digest("hex");

const ACCENT_PATTERN = /^#[0-9a-f]{6}$/i;

const createAccessToken = (user: UserDocument) =>
  jwt.sign(
    { userId: user.id, email: user.email, tv: user.tokenVersion ?? 0 },
    process.env.JWT_KEY as string,
    { expiresIn: "1h" },
  );

// Written on its own rather than through user.save(), which would clash with the session pushed
// by startSession
const signOutEverywhere = (user: UserDocument) =>
  User.updateOne({ _id: user._id }, { $set: { refreshTokens: [] } });

// Starts a session on this device: a short-lived access token for the client to hold in memory, and
// a long-lived refresh token that only ever lives in an httpOnly cookie
const startSession = async (user: UserDocument, req: Request) => {
  const refresh = createRefreshToken();
  await User.updateOne({ _id: user._id }, {
    $push: {
      refreshTokens: {
        $each: [{ hash: refresh.hash, expires: refresh.expires }],
        $slice: -MAX_REFRESH_TOKENS,
      },
    },
  });
  setRefreshCookie(req.res as Response, refresh.token);

  return { user, token: createAccessToken(user), tokenExpiration: 1 };
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

const login = async (
  _: unknown,
  { email, password }: { email: string; password: string },
  req: Request,
) => {
  const user = await User.findOne({ email: email });
  if (!user) {
    throw USER_EMAIL_NOT_FOUND();
  }
  const isEqual = await bcrypt.compare(password, user.password);
  if (!isEqual) {
    throw INVALID_CREDENTIALS();
  }
  return startSession(user, req);
};

const tokenFindUser = async (_: unknown, _1: unknown, req: Request) => {
  checkAuth(req);
  return findUser(_, { id: req.userId as string });
};

const registerAndLogin = async (
  _: unknown,
  { user }: { user: UserInput },
  req: Request,
) => {
  await createUser(_, { user });
  return login(_, { email: user.email, password: user.password }, req);
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
      account: user.account,
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
const requestPasswordReset = async (
  _: unknown,
  { email }: { email: string },
) => {
  const user = await User.findOne({ email: email });
  if (!user) {
    return { success: true };
  }

  // Requesting again replaces the previous token, so only the latest emailed link works
  const token = crypto.randomBytes(32).toString("hex");
  user.passwordResetTokenHash = hashResetToken(token);
  user.passwordResetExpires = new Date(
    Date.now() + PASSWORD_RESET_EXPIRY_MINUTES * 60 * 1000,
  );
  await user.save();

  await sendPasswordResetEmail({
    to: user.email,
    firstName: user.firstName,
    token,
    expiresInMinutes: PASSWORD_RESET_EXPIRY_MINUTES,
  });

  return { success: true };
};

const findUserByResetToken = (token: string) =>
  User.findOne({
    passwordResetTokenHash: hashResetToken(token),
    passwordResetExpires: { $gt: new Date() },
  });

// Lets the reset page show an expired link before the user types a new password
const passwordResetTokenValid = async (
  _: unknown,
  { token }: { token: string },
) => {
  const user = await findUserByResetToken(token);
  return { valid: Boolean(user), email: user?.email ?? null };
};

// Sets the new password, uses up the token and signs the user in
const resetPassword = async (
  _: unknown,
  { token, password }: { token: string; password: string },
  req: Request,
) => {
  const user = await findUserByResetToken(token);
  if (!user) {
    throw PASSWORD_RESET_TOKEN_INVALID();
  }

  validatePassword(password);

  user.password = await bcrypt.hash(password, 12);
  user.tokenVersion = (user.tokenVersion ?? 0) + 1;
  user.passwordResetTokenHash = undefined;
  user.passwordResetExpires = undefined;
  await user.save();
  // Whoever knew the old password is signed out everywhere
  await signOutEverywhere(user);

  return startSession(user, req);
};

const editUser = async (
  _: unknown,
  { id, user }: { id: string; user: UserInput },
  req: Request,
) => {
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
    new: true,
  });

  if (!editedUser) {
    throw USER_UPDATE_FAILED();
  }

  return {
    user: editedUser,
    success: true,
  };
};

// Acts on the user the token belongs to, so nobody can change someone else's details
const updateCurrentUser = async (
  _: unknown,
  { input }: { input: UserDetailsInput },
  req: Request,
) => {
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
  {
    currentPassword,
    newPassword,
  }: { currentPassword: string; newPassword: string },
  req: Request,
) => {
  checkAuth(req);
  const user = await findUser(_, { id: req.userId as string });

  const isEqual = await bcrypt.compare(currentPassword, user.password);
  if (!isEqual) {
    throw INVALID_CREDENTIALS();
  }
  validatePassword(newPassword);

  user.password = await bcrypt.hash(newPassword, 12);
  user.tokenVersion = (user.tokenVersion ?? 0) + 1;
  incrementVersion(user);
  await user.save();
  // Every other device is signed out; this one carries on with a fresh session
  await signOutEverywhere(user);
  await startSession(user, req);

  return { user, success: true };
};

// Swaps the refresh cookie for a new access token and a new cookie. Each refresh token works once,
// so a copied one stops working as soon as the real device has used it.
const refreshSession = async (_: unknown, _1: unknown, req: Request) => {
  const token = readRefreshCookie(req);
  if (!token) {
    throw REFRESH_TOKEN_INVALID();
  }

  const hash = hashRefreshToken(token);
  // Taking the token off the user is what claims it, so two requests can't both use it
  const user = await User.findOneAndUpdate(
    { refreshTokens: { $elemMatch: { hash, expires: { $gt: new Date() } } } },
    { $pull: { refreshTokens: { hash } } },
  );
  if (!user) {
    clearRefreshCookie(req.res as Response);
    throw REFRESH_TOKEN_INVALID();
  }

  return startSession(user, req);
};

const logout = async (_: unknown, _1: unknown, req: Request) => {
  const token = readRefreshCookie(req);
  if (token) {
    const hash = hashRefreshToken(token);
    await User.updateOne({ "refreshTokens.hash": hash }, { $pull: { refreshTokens: { hash } } });
  }
  clearRefreshCookie(req.res as Response);
  return { success: true };
};

// Cancels every access token already handed out, and every refresh token, on every device
const logoutEverywhere = async (_: unknown, _1: unknown, req: Request) => {
  checkAuth(req);
  await User.updateOne(
    { _id: req.userId },
    { $set: { refreshTokens: [] }, $inc: { tokenVersion: 1 } },
  );
  clearRefreshCookie(req.res as Response);
  return { success: true };
};

const updatePreferences = async (
  _: unknown,
  { theme, accent }: { theme?: ThemePreference | null; accent?: string | null },
  req: Request,
) => {
  checkAuth(req);
  const user = await findUser(_, { id: req.userId as string });

  if (accent && !ACCENT_PATTERN.test(accent)) {
    throw INVALID_ACCENT();
  }
  if (theme) user.theme = theme;
  if (accent) user.accent = accent.toUpperCase();
  incrementVersion(user);
  await user.save();

  return { user, success: true };
};

const deleteUser = async (_: unknown, { id }: { id: string }, req: Request) => {
  checkAuth(req);

  return withTransaction(async (session) => {
    const user = await User.findById(id).populate("account").session(session);
    if (!user) {
      throw USER_NOT_FOUND(id);
    }

    if (user.account) {
      const account = await Account.findById(user.account._id)
        .populate("bills")
        .populate("notes")
        .populate("oneOffPayments")
        .populate("payday")
        .session(session);

      if (!account) {
        throw ACCOUNT_NOT_FOUND(user.account._id);
      }

      if (account.bills?.length > 0) {
        await Bill.deleteMany({
          _id: { $in: account.bills.map((bill) => bill._id) },
        }).session(session);
      }

      if (account.notes?.length > 0) {
        await Note.deleteMany({
          _id: { $in: account.notes.map((note) => note._id) },
        }).session(session);
      }

      if (account.oneOffPayments?.length > 0) {
        await OneOffPayment.deleteMany({
          _id: { $in: account.oneOffPayments.map((payment) => payment._id) },
        }).session(session);
      }

      // v2's recurring payments point at the account rather than being listed on it
      await RecurringPayment.deleteMany({ account: account._id }).session(
        session,
      );

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
  const result = await deleteUser(_, { id: req.userId as string }, req);
  clearRefreshCookie(req.res as Response);
  return result;
};

export const resolvers = {
  Query: {
    users: findUsers,
    user: findUser,
    tokenFindUser,
    passwordResetTokenValid,
  },
  Mutation: {
    login,
    refreshSession,
    logout,
    logoutEverywhere,
    updatePreferences,
    registerAndLogin,
    requestPasswordReset,
    resetPassword,
    createUser,
    editUser,
    deleteUser,
    updateCurrentUser,
    changePassword,
    deleteCurrentUser,
  },
};

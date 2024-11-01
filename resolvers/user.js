import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { checkAuth } from '../middleware/isAuth';
import { Account } from '../models/Account';
import { User } from '../models/User';
import { withTransaction } from '../utils/transactionHelpers';
import { Bill } from '../models/Bill';
import { Note } from '../models/Note';
import { OneOffPayment } from '../models/OneOffPayment';
import { Payday } from '../models/Payday';

const findUsers = async () => {
  const users = User.find();
  if (!users) {
    throw new Error(`No users currently exist`);
  }
  return users;
};

const findUser = async (_, { id }) => {
  const user = await User.findById(id);
  if (!user) {
    throw new Error(`User with id '${id}' does not exist`);
  }
  return user;
};

const login = async (_, { email, password }) => {
  const user = await User.findOne({ email: email });
  if (!user) {
    throw new Error('User does not exist');
  }
  const isEqual = await bcrypt.compare(password, user.password);
  if (!isEqual) {
    throw new Error('Password is incorrect');
  }
  const token = jwt.sign({ userId: user.id, email: user.email }, process.env.JWT_KEY, {
    expiresIn: '1h'
  });

  return { user, token: token, tokenExpiration: 1 };
};

const tokenFindUser = async (_, _1, req) => {
  checkAuth(req);
  return findUser(_, { id: req.userId }, req);
};

const createUser = async (_, { user }) => {
  try {
    const existingUser = await User.findOne({ email: user.email });
    if (existingUser) {
      throw new Error(`User with email already exists`);
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
        account.user = newUser;
        account.save();
      } else {
        throw new Error(`Account with ID ${newUser.account} could not be found`);
      }
    }

    if (newUser) {
      return { user: newUser, success: true };
    } else {
      throw new Error(`User could not be created`);
    }
  } catch (err) {
    throw err;
  }
};

const registerAndLogin = async (_, { user }) => {
  await createUser(_, { user });
  return login(_, { email: user.email, password: user.password });
};

const editUser = async (_, { id, user }, req) => {
  checkAuth(req);
  try {
    const currentUser = await User.findById(id);
    if (!currentUser) {
      throw new Error(`User with id '${id}' does not exist`);
    }

    if (user.password) {
      const hashedPassword = await bcrypt.hash(user.password, 12);
      user.password = hashedPassword;
    }

    const mergedUser = incrementVersion(Object.assign(currentUser, user));

    const editedUser = await User.findOneAndUpdate({ _id: id }, mergedUser, {
      new: true
    });

    if (editedUser) {
      return {
        user: editedUser,
        success: true
      };
    } else {
      throw new Error('User cannot be updated');
    }
  } catch (err) {
    throw err;
  }
};

const deleteUser = async (_, { id }, req) => {
  checkAuth(req);

  return withTransaction(async session => {
    const user = await User.findById(id).populate('account').session(session);
    if (!user) {
      throw new Error(`User with id '${id}' does not exist`);
    }

    if (user.account) {
      const account = await Account.findById(user.account._id)
        .populate('bills')
        .populate('notes')
        .populate('oneOffPayments')
        .populate('payday')
        .session(session);

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
      throw new Error('User cannot be deleted');
    }

    return { success: true };
  });
};

exports.resolvers = {
  Query: {
    users: findUsers,
    user: findUser,
    login,
    tokenFindUser
  },
  Mutation: {
    registerAndLogin,
    createUser,
    editUser,
    deleteUser
  }
};

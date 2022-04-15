import { User } from '../models/User';
import { Account } from '../models/Account';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

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
    throw new Error(`User with id: ${id} does not exist`);
  }
  return user;
};

const login = async (_, { email, password }) => {
  const user = await User.findOne({ email: email });
  if (!user) {
    throw new Error('User does not exist!');
  }
  const isEqual = await bcrypt.compare(password, user.password);
  if (!isEqual) {
    throw new Error('Password is incorrect!');
  }
  const token = jwt.sign({ userId: user.id, email: user.email }, 'somesupersecretkey', {
    expiresIn: '1h'
  });

  return { userId: user.id, token: token, tokenExpiration: 1 };
};

const createUser = async (_, { user }) => {
  try {
    const existingUser = await User.findOne({ email: user.email });
    if (existingUser) {
      throw new Error(`User with email: ${user.email} already exists`);
    }
    const hashedPassword = await bcrypt.hash(user.password, 12);

    const newUser = new User({
      email: user.email,
      password: hashedPassword,
      account: user.account
    });
    await newUser.save().then(() => {
      // UPDATE ACCOUNT USER FIELD
      if (newUser.account) {
        Account.findOne({ _id: newUser.account }, (err, account) => {
          if (err) {
            throw err;
          }
          account.user = newUser;
          account.save();
        });
      }
    });

    if (newUser) {
      return { user: newUser, success: true };
    } else {
      throw new Error(`User could not be created`);
    }
  } catch (err) {
    throw err;
  }
};

const editUser = async (_, { id, user }) => {
  try {
    const currentUser = await User.findById(id);
    if (!currentUser) {
      throw new Error(`User with id: ${id} does not exist`);
    }
    const mergedUser = Object.assign(currentUser, user);
    mergedUser.__v = mergedUser.__v + 1;

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

const deleteUser = async (_, { id }) => {
  try {
    const user = await User.findById(id);
    if (!user) {
      throw new Error(`User with id: ${id} does not exist`);
    }

    const response = await User.deleteOne({ _id: id });
    if (user && response.deletedCount == 1) {
      return {
        success: true
      };
    } else {
      throw new Error('User cannot be deleted');
    }
  } catch (err) {
    throw err;
  }
};

exports.resolvers = {
  Query: {
    users: findUsers,
    user: findUser,
    login
  },
  Mutation: {
    createUser,
    editUser,
    deleteUser
  }
};

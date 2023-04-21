import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { checkAuth } from '../middleware/isAuth';
import { Account } from '../models/Account';
import { User } from '../models/User';

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

const deleteUser = async (_, { id }, req) => {
  checkAuth(req);
  try {
    const user = await User.findById(id);
    if (!user) {
      throw new Error(`User with id '${id}' does not exist`);
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

import crypto from 'crypto';
import os from 'os';
import mongoose from 'mongoose';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createApp } from '../../app';
import '../../models/User';
import '../../models/Account';
import '../../models/Bill';
import '../../models/Note';
import '../../models/OneOffPayment';
import '../../models/Payday';
import '../../models/RecurringPayment';

let ctx;

// Starts the real express + apollo stack against an isolated database for this test file
export const setupTestApp = async () => {
  const dbName = `test_${crypto.randomBytes(6).toString('hex')}`;
  // The mongodb driver loads os via dynamic import(), which fails inside jest's CommonJS sandbox,
  // so provide it explicitly or the connection handshake is sent without client metadata.
  await mongoose.connect(process.env.MONGO_TEST_URI, { dbName, runtimeAdapters: { os } });
  // Unique indexes are relied on for duplicate detection, so make sure they exist
  await Promise.all(Object.values(mongoose.models).map(model => model.syncIndexes()));
  ctx = await createApp();
};

export const teardownTestApp = async () => {
  await ctx.server.stop();
  await mongoose.connection.dropDatabase();
  await mongoose.disconnect();
};

export const clearDatabase = async () => {
  await Promise.all(Object.values(mongoose.models).map(model => model.deleteMany({})));
};

// supertest agent bound to the app for non-GraphQL assertions
export const agent = () => request(ctx.app);

// Sends a GraphQL operation through HTTP, returning the full supertest response
export const gqlRaw = (query, variables, token) => {
  const req = request(ctx.app).post('/graphql').set('Content-Type', 'application/json');
  if (token) req.set('Authorization', `Bearer ${token}`);
  return req.send({ query, variables });
};

// Sends a GraphQL operation and returns the parsed body ({ data, errors })
export const gql = async (query, variables, token) => (await gqlRaw(query, variables, token)).body;

// Returns the first error's code or undefined
export const errorCode = body => body.errors?.[0]?.extensions?.code;

export const expiredToken = userId =>
  jwt.sign({ userId, email: 'x@x.com' }, process.env.JWT_KEY, { expiresIn: -10 });

const REGISTER = `
  mutation ($user: UserInput) {
    registerAndLogin(user: $user) { token tokenExpiration user { id email firstName surname account } }
  }
`;

const CREATE_ACCOUNT = `
  mutation ($account: CreateAccountInput!) {
    createAccount(account: $account) { success account { id bankBalance monthlyIncome } }
  }
`;

let counter = 0;

// Registers a user (and optionally an account) and returns their credentials
export const createUserWithAccount = async ({ withAccount = true, account = {} } = {}) => {
  counter += 1;
  const email = `user${counter}-${crypto.randomBytes(3).toString('hex')}@example.com`;
  const registered = await gql(REGISTER, {
    user: { email, password: 'Password123!', firstName: 'Test', surname: `User${counter}` }
  });
  const { token, user } = registered.data.registerAndLogin;
  if (!withAccount) return { token, user, email, password: 'Password123!' };

  const created = await gql(
    CREATE_ACCOUNT,
    { account: { bankBalance: 1000, monthlyIncome: 2000, userId: user.id, ...account } },
    token
  );
  const accountId = created.data.createAccount.account.id;
  return { token, user, email, password: 'Password123!', accountId };
};

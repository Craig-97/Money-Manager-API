import crypto from 'crypto';
import os from 'os';
import mongoose from 'mongoose';
import request from 'supertest';
import jwt from 'jsonwebtoken';
import { createApp } from '../../app';
import { resetRateLimits } from '../../middleware/rateLimit';
import '../../models/user/User';
import '../../models/account/Account';
import '../../models/note/Note';
import '../../models/payment/OneOffPayment';
import '../../models/payday/Payday';
import '../../models/payment/RecurringPayment';

export interface GqlError {
  message: string;
  extensions?: { code?: string; [key: string]: unknown };
}

// Parsed GraphQL response body; data is left loosely typed because each test selects its own fields
export interface GqlBody {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  data?: any;
  errors?: GqlError[];
}

export type Variables = Record<string, unknown>;

let ctx: Awaited<ReturnType<typeof createApp>>;

// Starts the real express + apollo stack against an isolated database for this test file
export const setupTestApp = async () => {
  const dbName = `test_${crypto.randomBytes(6).toString('hex')}`;
  // The mongodb driver loads os via dynamic import(), which fails inside jest's CommonJS sandbox,
  // so provide it explicitly or the connection handshake is sent without client metadata.
  await mongoose.connect(process.env.MONGO_TEST_URI as string, {
    dbName,
    runtimeAdapters: { os }
  });
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
  // Every test starts from a client that hasn't made any login or reset attempts
  resetRateLimits();
  await Promise.all(Object.values(mongoose.models).map(model => model.deleteMany({})));
};

// supertest agent bound to the app for non-GraphQL assertions
export const agent = () => request(ctx.app);

// Sends a GraphQL operation through HTTP, returning the full supertest response
export const gqlRaw = (query: string, variables?: Variables, token?: string, cookie?: string) => {
  const req = request(ctx.app).post('/graphql').set('Content-Type', 'application/json');
  if (token) req.set('Authorization', `Bearer ${token}`);
  if (cookie) req.set('Cookie', cookie);
  return req.send({ query, variables });
};

// Sends a GraphQL operation and returns the parsed body ({ data, errors })
export const gql = async (
  query: string,
  variables?: Variables,
  token?: string,
  cookie?: string
): Promise<GqlBody> => (await gqlRaw(query, variables, token, cookie)).body;

// The name=value part of the refresh cookie a response set, to send back like a browser would
export const refreshCookieFrom = (res: { headers: Record<string, unknown> }) => {
  const header = res.headers['set-cookie'] as string[] | undefined;
  return header?.find(cookie => cookie.startsWith('mm_refresh='))?.split(';')[0];
};

// Returns the first error's code or undefined
export const errorCode = (body: GqlBody) => body.errors?.[0]?.extensions?.code;

export const expiredToken = (userId: string) =>
  jwt.sign({ userId, email: 'x@x.com' }, process.env.JWT_KEY as string, { expiresIn: -10 });

const REGISTER = `
  mutation ($input: RegisterInput!) {
    registerAndLogin(input: $input) { token tokenExpiration user { id email firstName surname account } }
  }
`;

const CREATE_ACCOUNT = `
  mutation ($input: CreateAccountInput!) {
    createAccount(input: $input) { success account { id bankBalance monthlyIncome } }
  }
`;

let counter = 0;

export interface TestUser {
  id: string;
  email: string;
  firstName: string;
  surname: string;
  account: string | null;
}

export interface Credentials {
  token: string;
  user: TestUser;
  email: string;
  password: string;
}

interface CreateUserOptions {
  withAccount?: boolean;
  // Extra fields merged into the createAccount input (payday, recurringPayments, ...)
  account?: Variables;
}

// Registers a user (and optionally an account) and returns their credentials
export async function createUserWithAccount(
  options: CreateUserOptions & { withAccount: false }
): Promise<Credentials>;
export async function createUserWithAccount(
  options?: CreateUserOptions
): Promise<Credentials & { accountId: string }>;
export async function createUserWithAccount({
  withAccount = true,
  account = {}
}: CreateUserOptions = {}): Promise<Credentials & { accountId?: string }> {
  counter += 1;
  const email = `user${counter}-${crypto.randomBytes(3).toString('hex')}@example.com`;
  const password = 'Password123!';
  const registered = await gql(REGISTER, {
    input: { email, password, firstName: 'Test', surname: `User${counter}` }
  });
  const { token, user } = registered.data.registerAndLogin;
  if (!withAccount) return { token, user, email, password };

  const created = await gql(
    CREATE_ACCOUNT,
    { input: { bankBalance: 1000, monthlyIncome: 2000, ...account } },
    token
  );
  const accountId = created.data.createAccount.account.id;
  return { token, user, email, password, accountId };
}

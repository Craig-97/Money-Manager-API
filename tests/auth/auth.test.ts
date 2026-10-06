import {
  setupTestApp,
  teardownTestApp,
  clearDatabase,
  gql,
  errorCode,
  expiredToken,
  createUserWithAccount
} from '../helpers';

beforeAll(setupTestApp);
afterAll(teardownTestApp);
beforeEach(clearDatabase);

const USER_FIELDS = 'id email firstName surname account';

describe('registerAndLogin / login', () => {
  const REGISTER = `mutation ($input: RegisterInput!) {
    registerAndLogin(input: $input) { token tokenExpiration user { ${USER_FIELDS} } }
  }`;
  const LOGIN = `mutation ($email: String!, $password: String!) {
    login(email: $email, password: $password) { token tokenExpiration user { ${USER_FIELDS} } }
  }`;
  const input = { email: 'a@example.com', password: 'Secret123', firstName: 'Ann', surname: 'Lee' };

  it('registers a user and returns a token', async () => {
    const body = await gql(REGISTER, { input });
    expect(body.errors).toBeUndefined();
    const { token, tokenExpiration, user } = body.data.registerAndLogin;
    expect(token).toEqual(expect.any(String));
    expect(tokenExpiration).toBe(1);
    expect(user).toMatchObject({ email: 'a@example.com', firstName: 'Ann', surname: 'Lee' });
    expect(user.id).toEqual(expect.any(String));
  });

  it('rejects a duplicate email', async () => {
    await gql(REGISTER, { input });
    const body = await gql(REGISTER, { input });
    expect(errorCode(body)).toBe('USER_EXISTS');
  });

  it('logs in with correct credentials', async () => {
    await gql(REGISTER, { input });
    const body = await gql(LOGIN, { email: input.email, password: input.password });
    expect(body.errors).toBeUndefined();
    expect(body.data.login.user.email).toBe(input.email);
    expect(body.data.login.token).toEqual(expect.any(String));
  });

  it('rejects an incorrect password', async () => {
    await gql(REGISTER, { input });
    const body = await gql(LOGIN, { email: input.email, password: 'wrong' });
    expect(errorCode(body)).toBe('INVALID_CREDENTIALS');
  });

  it('rejects an unknown email', async () => {
    const body = await gql(LOGIN, { email: 'nobody@example.com', password: 'x' });
    expect(errorCode(body)).toBe('USER_EMAIL_NOT_FOUND');
  });
});

describe('authentication', () => {
  const ME = `query { tokenFindUser { ${USER_FIELDS} } }`;

  it('returns the current user for a valid token', async () => {
    const { token, user } = await createUserWithAccount({ withAccount: false });
    const body = await gql(ME, undefined, token);
    expect(body.errors).toBeUndefined();
    expect(body.data.tokenFindUser.id).toBe(user.id);
  });

  it('returns an invalid token error with no token', async () => {
    const body = await gql(ME);
    expect(errorCode(body)).toBe('UNAUTHENTICATED');
    expect(body.errors?.[0].message).toBe('Unauthenticated! - Invalid token');
    expect(body.errors?.[0].extensions?.invalid).toBe(true);
  });

  it('returns an invalid token error for a malformed token', async () => {
    const body = await gql(ME, undefined, 'not-a-jwt');
    expect(errorCode(body)).toBe('UNAUTHENTICATED');
    expect(body.errors?.[0].extensions?.invalid).toBe(true);
  });

  it('returns an expired token error for an expired token', async () => {
    const { user } = await createUserWithAccount({ withAccount: false });
    const body = await gql(ME, undefined, expiredToken(user.id));
    expect(errorCode(body)).toBe('UNAUTHENTICATED');
    expect(body.errors?.[0].message).toBe('Unauthenticated! - Expired token');
    expect(body.errors?.[0].extensions?.expired).toBe(true);
  });
});

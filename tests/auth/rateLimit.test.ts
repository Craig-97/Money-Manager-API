import * as mailer from '../../utils/email/mailer';
import {
  setupTestApp,
  teardownTestApp,
  clearDatabase,
  gql,
  gqlRaw,
  agent,
  errorCode,
  createUserWithAccount
} from '../helpers';

beforeAll(setupTestApp);
afterAll(teardownTestApp);
beforeEach(clearDatabase);

const sendEmail = jest.spyOn(mailer, 'sendEmail').mockResolvedValue(undefined);
beforeEach(() => sendEmail.mockClear());

const LOGIN = `query ($email: String!, $password: String!) {
  login(email: $email, password: $password) { token }
}`;
const REQUEST = `mutation ($email: String!) { requestPasswordReset(email: $email) { success } }`;
const RESET = `mutation ($token: String!, $password: String!) {
  resetPassword(token: $token, password: $password) { token }
}`;

const attempt = (query: string, variables: Record<string, unknown>) => gqlRaw(query, variables);

describe('login attempts', () => {
  it('blocks an email after 10 attempts', async () => {
    const { email } = await createUserWithAccount({ withAccount: false });

    for (let i = 0; i < 10; i++) {
      expect(errorCode((await attempt(LOGIN, { email, password: 'wrong' })).body)).toBe(
        'INVALID_CREDENTIALS'
      );
    }

    const blocked = await attempt(LOGIN, { email, password: 'wrong' });
    expect(blocked.status).toBe(429);
    expect(errorCode(blocked.body)).toBe('TOO_MANY_REQUESTS');
    expect(blocked.body.errors[0].message).toMatch(/Too many attempts\. Try again in \d+ minutes?\./);
    expect(blocked.body.errors[0].extensions.retryAfter).toBeGreaterThan(0);
    expect(blocked.headers['retry-after']).toBeDefined();
  });

  it('blocks the right password too once the limit is reached', async () => {
    const { email, password } = await createUserWithAccount({ withAccount: false });
    for (let i = 0; i < 10; i++) await attempt(LOGIN, { email, password: 'wrong' });

    expect((await attempt(LOGIN, { email, password })).status).toBe(429);
  });

  it('counts the email without regard to case or surrounding spaces', async () => {
    const { email } = await createUserWithAccount({ withAccount: false });
    for (let i = 0; i < 10; i++) {
      await attempt(LOGIN, { email: i % 2 ? email.toUpperCase() : ` ${email} `, password: 'wrong' });
    }

    expect((await attempt(LOGIN, { email, password: 'wrong' })).status).toBe(429);
  });

  it('still lets other emails sign in from the same IP', async () => {
    const first = await createUserWithAccount({ withAccount: false });
    const second = await createUserWithAccount({ withAccount: false });
    for (let i = 0; i < 10; i++) await attempt(LOGIN, { email: first.email, password: 'wrong' });

    const body = await gql(LOGIN, { email: second.email, password: second.password });
    expect(body.errors).toBeUndefined();
    expect(body.data.login.token).toEqual(expect.any(String));
  });

  it('blocks an IP guessing across many emails after 50 attempts', async () => {
    for (let i = 0; i < 50; i++) {
      await attempt(LOGIN, { email: `nobody${i}@example.com`, password: 'wrong' });
    }

    const blocked = await attempt(LOGIN, { email: 'nobody51@example.com', password: 'wrong' });
    expect(blocked.status).toBe(429);
    expect(errorCode(blocked.body)).toBe('TOO_MANY_REQUESTS');
  });

  it('counts attempts sent in the URL of a GET request', async () => {
    const { email } = await createUserWithAccount({ withAccount: false });
    for (let i = 0; i < 10; i++) {
      await agent()
        .get('/graphql')
        .query({ query: LOGIN, variables: JSON.stringify({ email, password: 'wrong' }) })
        .set('apollo-require-preflight', 'true');
    }

    expect((await attempt(LOGIN, { email, password: 'wrong' })).status).toBe(429);
  });

  it('counts a login written with the values inline', async () => {
    const { email } = await createUserWithAccount({ withAccount: false });
    for (let i = 0; i < 10; i++) {
      await gqlRaw(`query { login(email: "${email}", password: "wrong") { token } }`);
    }

    expect((await attempt(LOGIN, { email, password: 'wrong' })).status).toBe(429);
  });
});

describe('password reset requests', () => {
  it('allows 3 emails an hour to the same address, then blocks', async () => {
    const { email } = await createUserWithAccount({ withAccount: false });

    for (let i = 0; i < 3; i++) {
      expect((await gql(REQUEST, { email })).data.requestPasswordReset.success).toBe(true);
    }
    expect(sendEmail).toHaveBeenCalledTimes(3);

    const blocked = await attempt(REQUEST, { email });
    expect(blocked.status).toBe(429);
    expect(errorCode(blocked.body)).toBe('TOO_MANY_REQUESTS');
    expect(sendEmail).toHaveBeenCalledTimes(3);
  });

  it('blocks an address that has no account in the same way', async () => {
    for (let i = 0; i < 3; i++) await attempt(REQUEST, { email: 'nobody@example.com' });

    expect((await attempt(REQUEST, { email: 'nobody@example.com' })).status).toBe(429);
  });

  it('blocks an IP requesting for many addresses after 10 requests', async () => {
    for (let i = 0; i < 10; i++) await attempt(REQUEST, { email: `person${i}@example.com` });

    expect((await attempt(REQUEST, { email: 'person11@example.com' })).status).toBe(429);
  });
});

describe('reset token attempts', () => {
  it('blocks guessing tokens after 20 attempts', async () => {
    for (let i = 0; i < 20; i++) {
      expect(errorCode((await attempt(RESET, { token: `guess${i}`, password: 'NewPassword1' })).body)).toBe(
        'PASSWORD_RESET_TOKEN_INVALID'
      );
    }

    const blocked = await attempt(RESET, { token: 'guess21', password: 'NewPassword1' });
    expect(blocked.status).toBe(429);
    expect(errorCode(blocked.body)).toBe('TOO_MANY_REQUESTS');
  });
});

describe('other operations', () => {
  it('are not limited', async () => {
    const { token } = await createUserWithAccount({ withAccount: false });

    for (let i = 0; i < 60; i++) {
      const body = await gql(`query { tokenFindUser { id } }`, undefined, token);
      expect(body.errors).toBeUndefined();
    }
  });

  it('does not count registering', async () => {
    for (let i = 0; i < 15; i++) {
      const body = await gql(
        `mutation ($user: UserInput) { registerAndLogin(user: $user) { token } }`,
        { user: { email: `new${i}@example.com`, password: 'Password1', firstName: 'A', surname: 'B' } }
      );
      expect(body.errors).toBeUndefined();
    }
  });

  it('leaves a request that is not valid GraphQL for the server to reject', async () => {
    const response = await gqlRaw('this is not graphql');
    expect(response.status).toBe(400);
  });
});

import { GraphQLError } from 'graphql';
import { formatError } from '../../utils/errors';
import { authLog, logger } from '../../utils/logger';
import { setupTestApp, teardownTestApp, clearDatabase, gql, createUserWithAccount } from '../helpers';

beforeAll(setupTestApp);
afterAll(teardownTestApp);
beforeEach(clearDatabase);
afterEach(() => jest.restoreAllMocks());

describe('formatError', () => {
  it('hides an unexpected error from the client and logs it instead', () => {
    const logged = jest.spyOn(logger, 'error').mockImplementation(() => undefined);
    const raw = new Error('No matching document found for id "6ac3" version 1');

    const sent = formatError(
      { message: raw.message, path: ['changePassword'], extensions: { code: 'INTERNAL_SERVER_ERROR' } },
      raw
    );

    expect(sent).toEqual({
      message: 'Something went wrong. Please try again.',
      path: ['changePassword'],
      locations: undefined,
      extensions: { code: 'INTERNAL_SERVER_ERROR' }
    });
    expect(logged).toHaveBeenCalledWith(expect.objectContaining({ err: raw }), 'Unexpected error');
  });

  it('treats an error with no code as unexpected', () => {
    jest.spyOn(logger, 'error').mockImplementation(() => undefined);
    expect(formatError({ message: 'boom' }, new Error('boom')).message).toBe('Something went wrong. Please try again.');
  });

  it("passes the API's own errors through untouched", () => {
    const logged = jest.spyOn(logger, 'error');
    const formatted = { message: 'Password is incorrect', extensions: { code: 'INVALID_CREDENTIALS' } };
    expect(formatError(formatted, new GraphQLError(formatted.message))).toBe(formatted);
    expect(logged).not.toHaveBeenCalled();
  });
});

describe('auth events', () => {
  const LOGIN = `mutation ($email: String!, $password: String!) { login(email: $email, password: $password) { token } }`;

  it('logs a failed sign in with the user but not the password', async () => {
    const warn = jest.spyOn(authLog, 'warn');
    const { email, user } = await createUserWithAccount({ withAccount: false });

    await gql(LOGIN, { email, password: 'WrongPassword1' });

    expect(warn).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'login_failed', reason: 'wrong_password', userId: user.id }),
      'Sign in failed'
    );
    expect(JSON.stringify(warn.mock.calls)).not.toContain('WrongPassword1');
  });

  it('logs signing out everywhere', async () => {
    const info = jest.spyOn(authLog, 'info');
    const { token, user } = await createUserWithAccount({ withAccount: false });

    await gql(`mutation { logoutEverywhere { success } }`, undefined, token);

    expect(info).toHaveBeenCalledWith(
      expect.objectContaining({ event: 'logout_everywhere', userId: user.id }),
      'Signed out everywhere'
    );
  });
});
